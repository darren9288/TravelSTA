export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor, tripIdFrom } from "@/lib/role";

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

  // Fetch trip for exchange rates (needed for foreign currency settlement conversion)
  const { data: tripData } = await db.from("trips").select("cash_rate, wise_rate, foreign_currency").eq("id", trip_id).single();

  // Fetch top-ups, expenses, pool topups, and split settlements in parallel
  const [{ data: topups }, { data: expenses }, { data: poolTopups }, { data: settledFrom }, { data: settledTo }] = await Promise.all([
    db.from("wallet_topups").select("wallet_id, amount").in("wallet_id", walletIds),
    db.from("expenses").select("wallet_id, myr_amount, foreign_amount").in("wallet_id", walletIds),
    db.from("pool_topups").select("from_wallet_id, myr_amount, foreign_amount").in("from_wallet_id", walletIds),
    db.from("expense_splits").select("from_wallet_id, amount").in("from_wallet_id", walletIds).eq("is_settled", true),
    db.from("expense_splits").select("to_wallet_id, amount").in("to_wallet_id", walletIds).eq("is_settled", true),
  ]);

  // Build wallet metadata map
  const walletMap = Object.fromEntries((wallets ?? []).map((w) => [w.id, { currency: w.currency, name: w.name.toLowerCase() }]));

  function getRate(walletId: string): number {
    const w = walletMap[walletId];
    if (!w || w.currency === "MYR") return 1;
    return w.name.includes("wise") ? (tripData?.wise_rate ?? 1) : (tripData?.cash_rate ?? 1);
  }

  const balances: Record<string, number> = {};

  for (const t of topups ?? []) {
    balances[t.wallet_id] = (balances[t.wallet_id] ?? 0) + Number(t.amount);
  }
  for (const e of expenses ?? []) {
    if (!e.wallet_id) continue;
    const currency = walletMap[e.wallet_id]?.currency;
    const deduct = currency === "MYR" ? Number(e.myr_amount) : Number(e.foreign_amount ?? 0);
    balances[e.wallet_id] = (balances[e.wallet_id] ?? 0) - deduct;
  }
  for (const p of poolTopups ?? []) {
    if (!p.from_wallet_id) continue;
    const currency = walletMap[p.from_wallet_id]?.currency;
    const deduct = currency === "MYR" ? Number(p.myr_amount) : Number(p.foreign_amount ?? 0);
    balances[p.from_wallet_id] = (balances[p.from_wallet_id] ?? 0) - deduct;
  }
  // Settlements paid OUT from wallet (deduct)
  for (const s of settledFrom ?? []) {
    if (!s.from_wallet_id) continue;
    const rate = getRate(s.from_wallet_id);
    balances[s.from_wallet_id] = (balances[s.from_wallet_id] ?? 0) - Number(s.amount) * rate;
  }
  // Settlements received INTO wallet (add)
  for (const s of settledTo ?? []) {
    if (!s.to_wallet_id) continue;
    const rate = getRate(s.to_wallet_id);
    balances[s.to_wallet_id] = (balances[s.to_wallet_id] ?? 0) + Number(s.amount) * rate;
  }

  return NextResponse.json({ wallets: wallets ?? [], balances });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const denied = await requireEditor(body.trip_id); if (denied) return denied;
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
  const tripId = await tripIdFrom("wallets", id);
  if (tripId) { const denied = await requireEditor(tripId); if (denied) return denied; }
  const { error } = await serverDb().from("wallets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
