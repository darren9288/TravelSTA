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
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT ?? "mailto:noreply@travelsta.app";
  if (!pub || !priv) {
    throw new Error(
      "VAPID keys not set. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to Vercel env vars."
    );
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

// Send a push to every subscription for a given user. Dead endpoints (404/410
// from FCM) are pruned automatically so we don't keep retrying forever.
// Returns { sent, failed } so callers can log delivery rate if useful.
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  ensureConfigured();

  const db = serverDb();
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const deadIds: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      const sub: PushSubscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
        sent++;
        // Best-effort touch of last_seen_at — failure to write here is fine.
        db.from("push_subscriptions")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", s.id)
          .then(() => {}, () => {});
      } catch (e) {
        failed++;
        const err = e as { statusCode?: number; body?: string };
        // 404 / 410 = subscription gone. User uninstalled, revoked permission,
        // or cleared their browser data. Prune so we don't keep trying.
        if (err.statusCode === 404 || err.statusCode === 410) {
          deadIds.push(s.id);
        } else {
          console.error("[push.send] non-fatal:", err.statusCode, err.body?.slice(0, 200));
        }
      }
    })
  );

  if (deadIds.length > 0) {
    await db.from("push_subscriptions").delete().in("id", deadIds);
  }

  return { sent, failed };
}

// Send the same push to every member of a trip. Useful for "Mac added an
// expense" — every member except Mac gets the notification.
export async function sendPushToTripMembers(
  tripId: string,
  payload: PushPayload,
  excludeUserId?: string
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
      const { sent, failed } = await sendPushToUser(uid, payload);
      totalSent += sent;
      totalFailed += failed;
    })
  );
  return { sent: totalSent, failed: totalFailed };
}
