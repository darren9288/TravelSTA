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

  // Fetch trip for exchange rates (needed for foreign currency settlement conversion).
  // Includes the SECOND foreign currency's rates so wallets in that currency
  // convert correctly instead of using the first currency's rate.
  const { data: tripData } = await db
    .from("trips")
    .select("cash_rate, wise_rate, foreign_currency, cash_rate_2, wise_rate_2, foreign_currency_2")
    .eq("id", trip_id)
    .single();

  // Fetch top-ups, expenses, pool topups, net settlement payments, AND any
  // expense_splits that were manually settled with wallet picks. The split
  // path is separate from Settle All (which writes settlement_payments and
  // leaves split wallet ids null) — manual per-split settles store wallet
  // ids directly on the split row, so balance needs to read both sources.
  const [{ data: topups }, { data: expenses }, { data: poolTopups }, { data: settledFrom }, { data: settledTo }] = await Promise.all([
    db.from("wallet_topups").select("wallet_id, amount").in("wallet_id", walletIds),
    db.from("expenses").select("wallet_id, myr_amount, foreign_amount").in("wallet_id", walletIds),
    db.from("pool_topups").select("from_wallet_id, myr_amount, foreign_amount").in("from_wallet_id", walletIds),
    db.from("settlement_payments").select("from_wallet_id, amount, from_foreign_amount").in("from_wallet_id", walletIds),
    db.from("settlement_payments").select("to_wallet_id, amount, to_foreign_amount").in("to_wallet_id", walletIds),
  ]);

  // Per-split manual settles. Prefer the frozen foreign amount (migration 027);
  // fall back to a select without those columns if the migration hasn't run yet
  // (so the wallet balance never breaks during the deploy→migrate window).
  let splitsFrom = (await db.from("expense_splits").select("from_wallet_id, amount, from_foreign_amount").eq("is_settled", true).in("from_wallet_id", walletIds)).data as ({ from_wallet_id: string; amount: number; from_foreign_amount?: number | null }[]) | null;
  if (!splitsFrom) splitsFrom = (await db.from("expense_splits").select("from_wallet_id, amount").eq("is_settled", true).in("from_wallet_id", walletIds)).data as ({ from_wallet_id: string; amount: number }[]) | null;
  let splitsTo = (await db.from("expense_splits").select("to_wallet_id, amount, to_foreign_amount").eq("is_settled", true).in("to_wallet_id", walletIds)).data as ({ to_wallet_id: string; amount: number; to_foreign_amount?: number | null }[]) | null;
  if (!splitsTo) splitsTo = (await db.from("expense_splits").select("to_wallet_id, amount").eq("is_settled", true).in("to_wallet_id", walletIds)).data as ({ to_wallet_id: string; amount: number }[]) | null;

  // Build wallet metadata map
  const walletMap = Object.fromEntries((wallets ?? []).map((w) => [w.id, { currency: w.currency, name: w.name.toLowerCase() }]));

  function getRate(walletId: string): number {
    const w = walletMap[walletId];
    if (!w || w.currency === "MYR") return 1;
    const isWise = w.name.includes("wise");
    // Pick the correct rate pair for the wallet's currency. A wallet in the
    // trip's SECOND foreign currency must use cash_rate_2/wise_rate_2.
    if (tripData?.foreign_currency_2 && w.currency === tripData.foreign_currency_2) {
      return isWise ? (tripData?.wise_rate_2 ?? 1) : (tripData?.cash_rate_2 ?? 1);
    }
    return isWise ? (tripData?.wise_rate ?? 1) : (tripData?.cash_rate ?? 1);
  }

  const balances: Record<string, number> = {};

  for (const t of topups ?? []) {
    balances[t.wallet_id] = (balances[t.wallet_id] ?? 0) + Number(t.amount);
  }
  for (const e of expenses ?? []) {
    if (!e.wallet_id) continue;
    const currency = walletMap[e.wallet_id]?.currency;
    // Foreign wallet with no foreign_amount → convert from MYR at the wallet's
    // rate (mirrors wallet-history). Previously fell back to 0, silently
    // dropping the spend and overstating the wallet balance.
    const deduct = currency === "MYR"
      ? Number(e.myr_amount)
      : (e.foreign_amount != null ? Number(e.foreign_amount) : Number(e.myr_amount) * getRate(e.wallet_id));
    balances[e.wallet_id] = (balances[e.wallet_id] ?? 0) - deduct;
  }
  for (const p of poolTopups ?? []) {
    if (!p.from_wallet_id) continue;
    const currency = walletMap[p.from_wallet_id]?.currency;
    const deduct = currency === "MYR"
      ? Number(p.myr_amount)
      : (p.foreign_amount != null ? Number(p.foreign_amount) : Number(p.myr_amount) * getRate(p.from_wallet_id));
    balances[p.from_wallet_id] = (balances[p.from_wallet_id] ?? 0) - deduct;
  }
  // Settlements paid OUT from wallet (deduct). Use the frozen foreign amount
  // when available, falling back to live-rate conversion for legacy rows.
  for (const s of settledFrom ?? []) {
    if (!s.from_wallet_id) continue;
    const isForeign = walletMap[s.from_wallet_id]?.currency !== "MYR";
    let deduct: number;
    if (isForeign && s.from_foreign_amount != null) {
      deduct = Number(s.from_foreign_amount);
    } else if (isForeign) {
      deduct = Number(s.amount) * getRate(s.from_wallet_id);
    } else {
      deduct = Number(s.amount);
    }
    balances[s.from_wallet_id] = (balances[s.from_wallet_id] ?? 0) - deduct;
  }
  // Settlements received INTO wallet (add)
  for (const s of settledTo ?? []) {
    if (!s.to_wallet_id) continue;
    const isForeign = walletMap[s.to_wallet_id]?.currency !== "MYR";
    let add: number;
    if (isForeign && s.to_foreign_amount != null) {
      add = Number(s.to_foreign_amount);
    } else if (isForeign) {
      add = Number(s.amount) * getRate(s.to_wallet_id);
    } else {
      add = Number(s.amount);
    }
    balances[s.to_wallet_id] = (balances[s.to_wallet_id] ?? 0) + add;
  }
  // Per-split manual settlements paid OUT of a wallet. amount is MYR; for a
  // foreign wallet prefer the frozen from_foreign_amount (rate-at-settle-time),
  // falling back to a live-rate conversion for legacy rows.
  for (const s of (splitsFrom ?? []) as { from_wallet_id: string; amount: number; from_foreign_amount?: number | null }[]) {
    if (!s.from_wallet_id) continue;
    const isForeign = walletMap[s.from_wallet_id]?.currency !== "MYR";
    const deduct = !isForeign
      ? Number(s.amount)
      : (s.from_foreign_amount != null ? Number(s.from_foreign_amount) : Number(s.amount) * getRate(s.from_wallet_id));
    balances[s.from_wallet_id] = (balances[s.from_wallet_id] ?? 0) - deduct;
  }
  // Per-split manual settlements received INTO a wallet.
  for (const s of (splitsTo ?? []) as { to_wallet_id: string; amount: number; to_foreign_amount?: number | null }[]) {
    if (!s.to_wallet_id) continue;
    const isForeign = walletMap[s.to_wallet_id]?.currency !== "MYR";
    const add = !isForeign
      ? Number(s.amount)
      : (s.to_foreign_amount != null ? Number(s.to_foreign_amount) : Number(s.amount) * getRate(s.to_wallet_id));
    balances[s.to_wallet_id] = (balances[s.to_wallet_id] ?? 0) + add;
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

export async function PUT(req: NextRequest) {
  const { id, name } = await req.json();
  const tripId = await tripIdFrom("wallets", id);
  if (tripId) { const denied = await requireEditor(tripId); if (denied) return denied; }
  const { data, error } = await serverDb().from("wallets").update({ name }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const tripId = await tripIdFrom("wallets", id);
  if (tripId) { const denied = await requireEditor(tripId); if (denied) return denied; }
  const { error } = await serverDb().from("wallets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
