export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export async function GET(req: NextRequest) {
  const tripId = new URL(req.url).searchParams.get("trip_id");
  const supabase = db();

  let q = supabase
    .from("pool_topups")
    .select("*, pool:travelers!pool_id(*), contributed_by:travelers!contributed_by_id(*)")
    .order("date", { ascending: false });
  if (tripId) q = q.eq("trip_id", tripId);
  const { data: topups, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Calculate balance per pool: topups contributed - expenses paid by pool
  const balances: Record<string, number> = {};
  for (const t of topups ?? []) {
    const pid = t.pool_id;
    balances[pid] = (balances[pid] ?? 0) + Number(t.myr_amount);
  }
  if (tripId) {
    const { data: poolExpenses } = await supabase
      .from("expenses")
      .select("paid_by_id, myr_amount")
      .eq("trip_id", tripId);
    for (const e of poolExpenses ?? []) {
      if (balances[e.paid_by_id] !== undefined) {
        balances[e.paid_by_id] -= Number(e.myr_amount);
      }
    }
  }

  return NextResponse.json({ topups: topups ?? [], balances });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await db().from("pool_topups").insert({
    trip_id: body.trip_id,
    pool_id: body.pool_id,
    contributed_by_id: body.contributed_by_id,
    myr_amount: body.myr_amount ?? 0,
    foreign_amount: body.foreign_amount ?? null,
    date: body.date,
    notes: body.notes ?? null,
  }).select("*, pool:travelers!pool_id(*), contributed_by:travelers!contributed_by_id(*)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await db().from("pool_topups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
