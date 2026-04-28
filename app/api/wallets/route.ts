export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const trip_id = new URL(req.url).searchParams.get("trip_id");
  if (!trip_id) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const db = serverDb();

  const { data: wallets, error } = await db
    .from("wallets")
    .select("*, traveler:travelers!traveler_id(id, name, color)")
    .eq("trip_id", trip_id)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const walletIds = (wallets ?? []).map((w) => w.id);
  if (!walletIds.length) return NextResponse.json({ wallets: [], balances: {} });

  // Fetch top-ups, expenses, and pool topups linked to these wallets in parallel
  const [{ data: topups }, { data: expenses }, { data: poolTopups }] = await Promise.all([
    db.from("wallet_topups").select("wallet_id, amount").in("wallet_id", walletIds),
    db.from("expenses").select("wallet_id, myr_amount, foreign_amount").in("wallet_id", walletIds),
    db.from("pool_topups").select("from_wallet_id, myr_amount, foreign_amount").in("from_wallet_id", walletIds),
  ]);

  // Build balance map per wallet
  const walletMap = Object.fromEntries((wallets ?? []).map((w) => [w.id, w.currency]));
  const balances: Record<string, number> = {};

  for (const t of topups ?? []) {
    balances[t.wallet_id] = (balances[t.wallet_id] ?? 0) + Number(t.amount);
  }
  for (const e of expenses ?? []) {
    if (!e.wallet_id) continue;
    const currency = walletMap[e.wallet_id];
    const deduct = currency === "MYR" ? Number(e.myr_amount) : Number(e.foreign_amount ?? 0);
    balances[e.wallet_id] = (balances[e.wallet_id] ?? 0) - deduct;
  }
  for (const p of poolTopups ?? []) {
    if (!p.from_wallet_id) continue;
    const currency = walletMap[p.from_wallet_id];
    const deduct = currency === "MYR" ? Number(p.myr_amount) : Number(p.foreign_amount ?? 0);
    balances[p.from_wallet_id] = (balances[p.from_wallet_id] ?? 0) - deduct;
  }

  return NextResponse.json({ wallets: wallets ?? [], balances });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await serverDb().from("wallets").insert({
    trip_id: body.trip_id,
    traveler_id: body.traveler_id,
    name: body.name,
    currency: body.currency ?? "MYR",
  }).select("*, traveler:travelers!traveler_id(id, name, color)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await serverDb().from("wallets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
