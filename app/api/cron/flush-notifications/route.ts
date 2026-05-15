export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { _sendImmediateForFlush, type PushPayload, type PushCategory } from "@/lib/push";

// Called by Supabase pg_cron every minute via pg_net.http_post().
// Auth: Bearer token matching CRON_SECRET env var.
//
// What it does:
//   1. Pulls every pending row from notification_queue.
//   2. For each user, joins with their per-trip preference.
//   3. Filters to rows whose age >= the user's interval_minutes.
//      (so Medium/1min users flush items >=60s old, Low/5min users flush
//       items >=300s old. Frequent/0min items shouldn't be here at all,
//       but if they are, flush immediately.)
//   4. Groups by (user_id, trip_id), builds a coalesced summary payload,
//      sends one push per group, marks the rows delivered.
//
// Resilient to failures: any send error leaves the row pending so the next
// minute's run retries it.

type QueueRow = {
  id: string;
  user_id: string;
  trip_id: string | null;
  payload: PushPayload;
  category: PushCategory;
  created_at: string;
};

// ─── Coalescing logic ────────────────────────────────────────────────────────
// Two formats, picked by the user's detail_level preference:
//   - 'summary' (default): counts per category — "2 expenses added, 3 splits settled"
//   - 'detailed': bullet list of each event's original body (capped to keep
//     the notification readable; tail rows summarised as "...and N more")
type DetailLevel = "summary" | "detailed";

function coalesceSummary(rows: QueueRow[], tripName: string): PushPayload {
  const byCat: Record<string, number> = {};
  for (const r of rows) byCat[r.category] = (byCat[r.category] ?? 0) + 1;

  const lines: string[] = [];
  const order: { cat: PushCategory; label: (n: number) => string }[] = [
    { cat: "expense_add",   label: (n) => `${n} expense${n === 1 ? "" : "s"} added` },
    { cat: "expense_delete",label: (n) => `${n} expense${n === 1 ? "" : "s"} deleted` },
    { cat: "split_toggle",  label: (n) => `${n} split${n === 1 ? "" : "s"} settled` },
    { cat: "pool_topup",    label: (n) => `${n} pool top-up${n === 1 ? "" : "s"}` },
    { cat: "wallet_topup",  label: (n) => `${n} wallet top-up${n === 1 ? "" : "s"}` },
    { cat: "itinerary_add", label: (n) => `${n} itinerary item${n === 1 ? "" : "s"} added` },
    { cat: "settle_all",    label: (n) => `${n} Settle All round${n === 1 ? "" : "s"}` },
    { cat: "anomaly",       label: (n) => `⚠️ ${n} anomaly alert${n === 1 ? "" : "s"}` },
    { cat: "other",         label: (n) => `${n} other update${n === 1 ? "" : "s"}` },
  ];
  for (const o of order) {
    if (byCat[o.cat]) lines.push(`• ${o.label(byCat[o.cat])}`);
  }

  return {
    title: `${tripName} — ${rows.length} updates`,
    body: lines.join("\n"),
    url: `/trips/${rows[0].trip_id ?? ""}/expenses`,
    tag: `coalesced-${rows[0].trip_id}-${Date.now()}`,
  };
}

// Caps at 8 bullets — notification bodies above ~250 chars get truncated by
// the OS anyway. Tail rows past the cap become "...and N more".
const MAX_DETAILED_BULLETS = 8;

function coalesceDetailed(rows: QueueRow[], tripName: string): PushPayload {
  // Sort: anomalies first (high signal), then by original timestamp so the
  // reader sees the chronological story.
  const sorted = [...rows].sort((a, b) => {
    if (a.category === "anomaly" && b.category !== "anomaly") return -1;
    if (b.category === "anomaly" && a.category !== "anomaly") return 1;
    return a.created_at.localeCompare(b.created_at);
  });

  const head = sorted.slice(0, MAX_DETAILED_BULLETS);
  const tailCount = sorted.length - head.length;

  const bullets = head.map((r) => {
    // Prefer the original body (already designed to be informative). For
    // anomalies, also prefix with their title so the warning emoji is visible.
    if (r.category === "anomaly") {
      // Anomaly title is like "⚠️ Possible duplicate — Japan 2025" — strip
      // the trip-name suffix to keep the bullet short.
      const t = (r.payload.title ?? "").split(" — ")[0];
      return `• ${t}: ${r.payload.body}`;
    }
    return `• ${r.payload.body}`;
  });

  if (tailCount > 0) {
    bullets.push(`• ...and ${tailCount} more`);
  }

  return {
    title: `${tripName} — ${rows.length} updates`,
    body: bullets.join("\n"),
    url: `/trips/${rows[0].trip_id ?? ""}/expenses`,
    tag: `coalesced-${rows[0].trip_id}-${Date.now()}`,
  };
}

function coalesce(rows: QueueRow[], tripName: string, level: DetailLevel): PushPayload {
  // Single-event flush: always render in full detail, regardless of preference.
  if (rows.length === 1) return rows[0].payload;
  return level === "detailed"
    ? coalesceDetailed(rows, tripName)
    : coalesceSummary(rows, tripName);
}

export async function POST(req: NextRequest) {
  // Auth check: pg_cron sends `Authorization: Bearer <CRON_SECRET>`.
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = serverDb();

  // Pull every pending row. Use the partial index defined in the migration.
  const { data: queueRaw, error } = await db
    .from("notification_queue")
    .select("id, user_id, trip_id, payload, category, created_at")
    .is("delivered_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[cron.flush] queue fetch failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const queue = (queueRaw ?? []) as QueueRow[];
  if (queue.length === 0) {
    return NextResponse.json({ flushed: 0, message: "queue empty" });
  }

  // Bulk-load preferences for all (user, trip) pairs we care about.
  const pairs = new Set<string>();
  for (const r of queue) if (r.trip_id) pairs.add(`${r.user_id}|${r.trip_id}`);
  const prefMap: Record<string, number> = {};
  const detailMap: Record<string, DetailLevel> = {};
  if (pairs.size > 0) {
    const userIds = Array.from(new Set(queue.map((r) => r.user_id)));
    const tripIds = Array.from(new Set(queue.map((r) => r.trip_id).filter(Boolean) as string[]));
    const { data: prefs } = await db
      .from("user_notification_preferences")
      .select("user_id, trip_id, interval_minutes, detail_level")
      .in("user_id", userIds)
      .in("trip_id", tripIds);
    for (const p of (prefs ?? []) as { user_id: string; trip_id: string; interval_minutes: number; detail_level?: DetailLevel }[]) {
      const key = `${p.user_id}|${p.trip_id}`;
      prefMap[key] = p.interval_minutes;
      detailMap[key] = p.detail_level ?? "detailed";
    }
  }

  // Group rows that are ready to flush (age >= user's interval).
  // Key: `${user_id}|${trip_id}` → rows to coalesce
  const groups: Record<string, QueueRow[]> = {};
  const now = Date.now();
  for (const r of queue) {
    const key = `${r.user_id}|${r.trip_id ?? ""}`;
    // Default to Medium (1 min) for users without an explicit row — matches
    // sendPushToUser's default in lib/push.ts.
    const interval = prefMap[`${r.user_id}|${r.trip_id ?? ""}`] ?? 1;
    if (interval <= 0) {
      // Shouldn't be queued — flush immediately as catch-up.
      (groups[key] ||= []).push(r);
      continue;
    }
    const ageMs = now - new Date(r.created_at).getTime();
    if (ageMs >= interval * 60 * 1000) {
      (groups[key] ||= []).push(r);
    }
  }

  if (Object.keys(groups).length === 0) {
    return NextResponse.json({ flushed: 0, message: "no groups ready" });
  }

  // Look up trip names for the groups we're sending.
  const tripIds = Array.from(new Set(Object.keys(groups).map((k) => k.split("|")[1]).filter(Boolean)));
  let tripNameMap: Record<string, string> = {};
  if (tripIds.length > 0) {
    const { data: trips } = await db.from("trips").select("id, name").in("id", tripIds);
    tripNameMap = Object.fromEntries((trips ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
  }

  let flushed = 0;
  let failed = 0;
  const deliveredIds: string[] = [];

  for (const [key, rows] of Object.entries(groups)) {
    const [userId, tripId] = key.split("|");
    const tripName = tripNameMap[tripId] ?? "your trip";
    const level: DetailLevel = detailMap[key] ?? "detailed";
    const payload = coalesce(rows, tripName, level);

    try {
      const result = await _sendImmediateForFlush(userId, payload);
      if (result.sent > 0) {
        flushed += rows.length;
        deliveredIds.push(...rows.map((r) => r.id));
      } else {
        // No active subscriptions — mark as delivered anyway to avoid re-flushing forever.
        deliveredIds.push(...rows.map((r) => r.id));
      }
    } catch (e) {
      failed += rows.length;
      console.error("[cron.flush] send failed for user", userId, (e as Error).message);
    }
  }

  if (deliveredIds.length > 0) {
    await db
      .from("notification_queue")
      .update({ delivered_at: new Date().toISOString() })
      .in("id", deliveredIds);
  }

  return NextResponse.json({ flushed, failed, groups: Object.keys(groups).length });
}

// GET for manual debugging — same logic, same auth.
export async function GET(req: NextRequest) {
  return POST(req);
}
