import webpush, { PushSubscription } from "web-push";
import { serverDb } from "./supabase";

// VAPID = the identity proof our server includes in every push. The browser
// uses this to confirm the push actually came from us and not some random
// origin. Keys are generated once via `web-push generate-vapid-keys` and
// pasted into Vercel as env vars (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).
//
// VAPID_SUBJECT must be a mailto: or https:// URL — it tells the push
// service who to contact about abuse. mailto:noreply@example.com is fine.
let configured = false;
function ensureConfigured() {
  if (configured) return;
  // Vercel sometimes preserves whitespace from copy-paste. Trim everything
  // so a stray newline doesn't break web-push's strict url validation.
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  let subj = (process.env.VAPID_SUBJECT ?? "mailto:noreply@travelsta.app").trim();

  if (!pub || !priv) {
    throw new Error(
      "VAPID keys not set. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to Vercel env vars."
    );
  }

  // Subject must start with mailto: or https://. If it doesn't (typo, missing
  // prefix, hidden chars left over after trim) fall back to a safe default
  // instead of failing every push.
  if (!subj.startsWith("mailto:") && !subj.startsWith("https://")) {
    console.warn(
      `[push] VAPID_SUBJECT was malformed (raw bytes: ${JSON.stringify(subj)}). Falling back to default.`
    );
    subj = "mailto:noreply@travelsta.app";
  }

  webpush.setVapidDetails(subj, pub, priv);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;       // where to land when the user taps the notification (e.g. "/trips/abc/expenses")
  tag?: string;       // notifications with the same tag replace each other instead of stacking
  icon?: string;      // override the default app icon
};

// Categories used by the queue to group/coalesce pushes. The cron job uses
// these to build a summary like "2 expenses added, 3 splits settled".
export type PushCategory =
  | "expense_add"
  | "expense_delete"
  | "split_toggle"
  | "pool_topup"
  | "wallet_topup"
  | "itinerary_add"
  | "settle_all"
  | "anomaly"
  | "other";

export type PushOptions = {
  tripId?: string;          // used to look up the user's per-trip preference + group queued items
  category?: PushCategory;  // used by the cron coalescer; defaults to "other"
  isAnomaly?: boolean;      // anomalies always send immediately, bypassing the queue
};

// Low-level: send a push payload to one subscription. Used by both the
// immediate path and the cron flush path. Returns true on success.
async function deliverPush(sub: PushSubscription, payload: PushPayload): Promise<{ ok: boolean; statusCode?: number }> {
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    return { ok: true };
  } catch (e) {
    const err = e as { statusCode?: number };
    return { ok: false, statusCode: err.statusCode };
  }
}

// Immediate send to every subscription for a user. Dead endpoints get pruned.
// Used directly when the user prefers Frequent mode or for anomaly pushes.
async function sendImmediate(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  ensureConfigured();
  const db = serverDb();
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const deadIds: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      const sub: PushSubscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      const { ok, statusCode } = await deliverPush(sub, payload);
      if (ok) {
        sent++;
        db.from("push_subscriptions")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", s.id)
          .then(() => {}, () => {});
      } else {
        failed++;
        if (statusCode === 404 || statusCode === 410) deadIds.push(s.id);
        else console.error("[push.send] non-fatal:", statusCode);
      }
    })
  );

  if (deadIds.length > 0) {
    await db.from("push_subscriptions").delete().in("id", deadIds);
  }
  return { sent, failed };
}

// Queue a push for later flushing. The cron job picks it up after the user's
// configured interval and coalesces it with other queued items.
async function queuePush(
  userId: string,
  tripId: string | undefined,
  payload: PushPayload,
  category: PushCategory
): Promise<void> {
  const db = serverDb();
  await db.from("notification_queue").insert({
    user_id: userId,
    trip_id: tripId ?? null,
    payload: payload as unknown as Record<string, unknown>,
    category,
  });
}

// Look up the user's notification preference for a specific trip.
// Returns interval_minutes (0 = Frequent / immediate, 1 = Medium, 5 = Low,
// -1 = Off / anomalies only). Defaults to 1 (Medium) if no row exists —
// see migration 024 for the rationale.
async function getInterval(userId: string, tripId: string | undefined): Promise<number> {
  if (!tripId) return 0; // no trip context → send immediately, can't be queued without trip_id
  const db = serverDb();
  const { data } = await db
    .from("user_notification_preferences")
    .select("interval_minutes")
    .eq("user_id", userId)
    .eq("trip_id", tripId)
    .maybeSingle();
  return (data as { interval_minutes?: number } | null)?.interval_minutes ?? 1;
}

// Public: route a push for a single user based on their preference.
//   - Anomalies always send immediately (bypass preference).
//   - "Off" (-1) silently drops non-anomaly pushes.
//   - "Frequent" (0) sends immediately.
//   - "Medium" (1) / "Low" (5) queue for the cron job to coalesce.
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  options?: PushOptions
): Promise<{ sent: number; failed: number; queued?: boolean; skipped?: boolean }> {
  // Anomalies bypass preferences entirely.
  if (options?.isAnomaly) {
    return sendImmediate(userId, payload);
  }

  const interval = await getInterval(userId, options?.tripId);

  if (interval === -1) {
    return { sent: 0, failed: 0, skipped: true };
  }
  if (interval === 0) {
    return sendImmediate(userId, payload);
  }

  // interval > 0 → queue for the cron flush.
  await queuePush(userId, options?.tripId, payload, options?.category ?? "other");
  return { sent: 0, failed: 0, queued: true };
}

// Send the same push to every member of a trip. Useful for "Mac added an
// expense" — every member except Mac gets the notification (per their
// individual preference).
export async function sendPushToTripMembers(
  tripId: string,
  payload: PushPayload,
  excludeUserId?: string,
  options?: Omit<PushOptions, "tripId">
): Promise<{ sent: number; failed: number }> {
  const db = serverDb();
  const { data: members } = await db
    .from("trip_members")
    .select("user_id")
    .eq("trip_id", tripId);

  if (!members) return { sent: 0, failed: 0 };

  const targets = members
    .map((m) => m.user_id)
    .filter((id) => id && id !== excludeUserId);

  let totalSent = 0;
  let totalFailed = 0;
  await Promise.all(
    targets.map(async (uid) => {
      const { sent, failed } = await sendPushToUser(uid, payload, { ...options, tripId });
      totalSent += sent;
      totalFailed += failed;
    })
  );
  return { sent: totalSent, failed: totalFailed };
}

// Internal helper exported for the cron flush endpoint to use directly,
// bypassing the preference check (since the cron IS the flush).
export async function _sendImmediateForFlush(userId: string, payload: PushPayload) {
  return sendImmediate(userId, payload);
}
