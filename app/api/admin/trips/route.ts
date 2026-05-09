export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireSuperAdmin } from "@/lib/admin";

// GET /api/admin/trips — every trip in the system, regardless of membership.
export async function GET() {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const db = serverDb();

  const { data: trips, error } = await db
    .from("trips")
    .select("id, name, destination, start_date, end_date, join_code, created_at, created_by_user_id")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Member + expense counts per trip.
  const tripIds = (trips ?? []).map((t) => t.id);
  const { data: members } = await db.from("trip_members").select("trip_id").in("trip_id", tripIds);
  const { data: expenses } = await db.from("expenses").select("trip_id, myr_amount").in("trip_id", tripIds);
  const memberCount = (members ?? []).reduce<Record<string, number>>((acc, m) => {
    acc[m.trip_id] = (acc[m.trip_id] ?? 0) + 1;
    return acc;
  }, {});
  const expenseStats = (expenses ?? []).reduce<Record<string, { count: number; total: number }>>((acc, e) => {
    if (!acc[e.trip_id]) acc[e.trip_id] = { count: 0, total: 0 };
    acc[e.trip_id].count += 1;
    acc[e.trip_id].total += Number(e.myr_amount ?? 0);
    return acc;
  }, {});

  // Look up creator usernames.
  const creatorIds = Array.from(new Set((trips ?? []).map((t) => t.created_by_user_id).filter(Boolean))) as string[];
  const { data: profiles } = await db.from("profiles").select("id, username").in("id", creatorIds);
  const usernameById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.username]));

  const result = (trips ?? []).map((t) => ({
    ...t,
    member_count: memberCount[t.id] ?? 0,
    expense_count: expenseStats[t.id]?.count ?? 0,
    total_myr: expenseStats[t.id]?.total ?? 0,
    created_by_username: t.created_by_user_id ? usernameById[t.created_by_user_id] ?? null : null,
  }));

  return NextResponse.json({ trips: result });
}

// DELETE /api/admin/trips — body: { trip_id }. Cascades to all child tables via FKs.
export async function DELETE(req: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const { trip_id } = await req.json();
  if (!trip_id) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const db = serverDb();
  const { error } = await db.from("trips").delete().eq("id", trip_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
