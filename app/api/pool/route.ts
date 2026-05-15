export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor, tripIdFrom } from "@/lib/role";
import { getSessionUser } from "@/lib/supabase-server";
import { sendPushToTripMembers } from "@/lib/push";
import { detectPoolOverdraft } from "@/lib/anomalies";
import { logActivity } from "@/lib/activity-log";

export async function GET(req: NextRequest) {
  const tripId = new URL(req.url).searchParams.get("trip_id");
  const supabase = serverDb();

  let q = supabase
    .from("pool_topups")
    .select("*, pool:travelers!pool_id(*), contributed_by:travelers!contributed_by_id(*)")
    .order("date", { ascending: false });
  if (tripId) q = q.eq("trip_id", tripId);
  const { data: topups, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const balances: Record<string, number> = {};
  for (const t of topups ?? []) {
    const pid = t.pool_id;
    balances[pid] = (balances[pid] ?? 0) + Number(t.myr_amount);
  }
  let expenses: unknown[] = [];
  if (tripId) {
    const { data: poolExpenses } = await supabase
      .from("expenses")
      .select("id, paid_by_id, myr_amount, foreign_amount, date, category, notes")
      .eq("trip_id", tripId);
    for (const e of poolExpenses ?? []) {
      if (balances[e.paid_by_id] !== undefined) {
        balances[e.paid_by_id] -= Number(e.myr_amount);
        expenses.push(e);
      }
    }
  }

  return NextResponse.json({ topups: topups ?? [], balances, expenses });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const denied = await requireEditor(body.trip_id); if (denied) return denied;
  const { data, error } = await serverDb().from("pool_topups").insert({
    trip_id: body.trip_id,
    pool_id: body.pool_id,
    contributed_by_id: body.contributed_by_id,
    myr_amount: body.myr_amount ?? 0,
    foreign_amount: body.foreign_amount ?? null,
    date: body.date,
    notes: body.notes ?? null,
    from_wallet_id: body.from_wallet_id ?? null,
  }).select("*, pool:travelers!pool_id(*), contributed_by:travelers!contributed_by_id(*)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  {
    const meUser = await getSessionUser();
    void logActivity({
      action: "pool_topup",
      userId: meUser?.id ?? null,
      tripId: body.trip_id,
      details: { pool_id: body.pool_id, myr_amount: body.myr_amount },
      req,
    });
  }

  // Push: "{contributor} topped up {pool} — RM {amount}"
  try {
    const me = await getSessionUser();
    const contributorName = (data as { contributed_by?: { name?: string } })?.contributed_by?.name ?? "Someone";
    const poolName = (data as { pool?: { name?: string } })?.pool?.name ?? "pool";
    const myr = Number(body.myr_amount ?? 0).toFixed(0);
    const foreignAmt = body.foreign_amount ? ` (¥${Math.round(body.foreign_amount)})` : "";
    const { data: trip } = await serverDb().from("trips").select("name").eq("id", body.trip_id).single();
    const tripName = trip?.name ?? "your trip";
    void sendPushToTripMembers(
      body.trip_id,
      {
        title: `Pool top-up — ${tripName}`,
        body: `${contributorName} added RM ${myr}${foreignAmt} to ${poolName}`,
        url: `/trips/${body.trip_id}/pool`,
        tag: `pool-topup-${data.id}`,
      },
      me?.id,
      { category: "pool_topup" }
    ).catch((e: unknown) => console.error("[push.pool-topup]", (e as Error).message));
  } catch (e) {
    console.error("[push.pool-topup] setup failed:", (e as Error).message);
  }

  // Anomaly: check pool overdraft AFTER the top-up. If still negative, the
  // top-up wasn't enough — surface it so someone tops up more.
  try {
    const { data: trip } = await serverDb().from("trips").select("name").eq("id", body.trip_id).single();
    const tripName = trip?.name ?? "your trip";
    const overdrafts = await detectPoolOverdraft(body.trip_id, tripName);
    for (const a of overdrafts) {
      void sendPushToTripMembers(
        body.trip_id,
        { title: a.title, body: a.body, url: a.url, tag: a.tag },
        undefined,
        { category: "anomaly", isAnomaly: true }
      ).catch((e: unknown) => console.error(`[push.anomaly.${a.type}]`, (e as Error).message));
    }
  } catch (e) {
    console.error("[push.anomaly-pool] setup failed:", (e as Error).message);
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { id, myr_amount, foreign_amount, date, notes } = await req.json();
  const tripId = await tripIdFrom("pool_topups", id);
  if (tripId) { const denied = await requireEditor(tripId); if (denied) return denied; }
  const { data, error } = await serverDb().from("pool_topups")
    .update({ myr_amount, foreign_amount: foreign_amount ?? null, date, notes: notes ?? null })
    .eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const tripId = await tripIdFrom("pool_topups", id);
  if (tripId) { const denied = await requireEditor(tripId); if (denied) return denied; }
  const { error } = await serverDb().from("pool_topups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
