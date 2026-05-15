export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireSuperAdmin } from "@/lib/admin";

// GET /api/admin/activity-log
// Query params (all optional):
//   user_id=<uuid>     filter by user
//   trip_id=<uuid>     filter by trip
//   action=<verb>      filter by action ('expense_add', 'page_view', etc.)
//   limit=<int>        default 200, max 1000
//
// Returns the most recent rows newest-first, joined with username + trip name
// for display.

export async function GET(req: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const p = new URL(req.url).searchParams;
  const userId = p.get("user_id");
  const tripId = p.get("trip_id");
  const action = p.get("action");
  const limit = Math.min(parseInt(p.get("limit") ?? "200", 10) || 200, 1000);

  const db = serverDb();
  let q = db
    .from("activity_log")
    .select("id, user_id, trip_id, action, details, user_agent, ip, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) q = q.eq("user_id", userId);
  if (tripId) q = q.eq("trip_id", tripId);
  if (action) q = q.eq("action", action);

  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Look up usernames + trip names so the admin doesn't see raw UUIDs.
  const userIds = Array.from(new Set((rows ?? []).map((r: { user_id: string | null }) => r.user_id).filter(Boolean) as string[]));
  const tripIds = Array.from(new Set((rows ?? []).map((r: { trip_id: string | null }) => r.trip_id).filter(Boolean) as string[]));

  const [{ data: profiles }, { data: trips }] = await Promise.all([
    userIds.length
      ? db.from("profiles").select("id, username").in("id", userIds)
      : Promise.resolve({ data: [] }),
    tripIds.length
      ? db.from("trips").select("id, name").in("id", tripIds)
      : Promise.resolve({ data: [] }),
  ]);

  const userMap = Object.fromEntries(((profiles ?? []) as { id: string; username: string }[]).map((u) => [u.id, u.username]));
  const tripMap = Object.fromEntries(((trips ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));

  const enriched = (rows ?? []).map((r: { user_id: string | null; trip_id: string | null }) => ({
    ...r,
    username: r.user_id ? userMap[r.user_id] ?? null : null,
    trip_name: r.trip_id ? tripMap[r.trip_id] ?? null : null,
  }));

  return NextResponse.json({ entries: enriched, count: enriched.length });
}
