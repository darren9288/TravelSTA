export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

export type WalletEvent = {
  id: string;
  type: "topup" | "expense" | "settlement_out" | "settlement_in" | "pool_topup" | "split_settle_out" | "split_settle_in";
  date: string;
  created_at: string;
  amount: number; // in wallet's native currency, always positive
  sign: 1 | -1;  // +1 = money in, -1 = money out
  description: string;
  category?: string;
  notes?: string | null;
  counterpart?: string | null; // traveler/pool name for settlement and pool_topup events
};

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const wallet_id = p.get("wallet_id");
  const trip_id = p.get("trip_id");
  if (!wallet_id || !trip_id) return NextResponse.json({ error: "wallet_id and trip_id required" }, { status: 400 });

  const db = serverDb();

  const { data: wallet } = await db.from("wallets").select("currency, name").eq("id", wallet_id).single();
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const { data: trip } = await db.from("trips").select("cash_rate, wise_rate, foreign_currency").eq("id", trip_id).single();
  const isForeign = wallet.currency !== "MYR";
  const rate = isForeign
    ? (wallet.name.toLowerCase().includes("wise") ? (trip?.wise_rate ?? 1) : (trip?.cash_rate ?? 1))
    : 1;

  const [{ data: topups }, { data: expenses }, { data: settlementsOut }, { data: settlementsIn }, { data: travelers }, { data: poolTopups }, { data: splitsOut }, { data: splitsIn }] = await Promise.all([
    db.from("wallet_topups").select("id, amount, date, notes, created_at").eq("wallet_id", wallet_id).order("date"),
    db.from("expenses").select("id, date, myr_amount, foreign_amount, category, notes, created_at").eq("wallet_id", wallet_id).order("date"),
    db.from("settlement_payments").select("id, amount, from_foreign_amount, to_traveler_id, created_at").eq("from_wallet_id", wallet_id),
    db.from("settlement_payments").select("id, amount, to_foreign_amount, from_traveler_id, created_at").eq("to_wallet_id", wallet_id),
    db.from("travelers").select("id, name").eq("trip_id", trip_id),
    db.from("pool_topups").select("id, myr_amount, foreign_amount, date, notes, created_at, pool:travelers!pool_id(name)").eq("from_wallet_id", wallet_id).order("date"),
    // Per-split manual settles paid OUT of this wallet (one-off Tick UI, not Settle All).
    db.from("expense_splits").select("id, amount, traveler_id, expense_id, expense:expenses(date, category, paid_by_id, created_at)").eq("is_settled", true).eq("from_wallet_id", wallet_id),
    // Per-split manual settles received INTO this wallet (we're the payer being paid back).
    db.from("expense_splits").select("id, amount, traveler_id, expense_id, expense:expenses(date, category, paid_by_id, created_at)").eq("is_settled", true).eq("to_wallet_id", wallet_id),
  ]);

  const travelerMap: Record<string, string> = {};
  for (const t of travelers ?? []) travelerMap[t.id] = t.name;

  const events: WalletEvent[] = [];

  for (const t of topups ?? []) {
    events.push({ id: t.id, type: "topup", date: t.date, created_at: t.created_at, amount: Number(t.amount), sign: 1, description: "Top-up", notes: t.notes });
  }
  for (const e of expenses ?? []) {
    // For a foreign wallet, prefer the entered foreign_amount when present.
    // If the user only entered MYR (foreign_amount NULL), convert it using
    // the trip's exchange rate so the wallet history doesn't show -JPY 0.
    const amt = isForeign
      ? (e.foreign_amount != null ? Number(e.foreign_amount) : Number(e.myr_amount) * rate)
      : Number(e.myr_amount);
    events.push({ id: e.id, type: "expense", date: e.date, created_at: e.created_at, amount: amt, sign: -1, description: e.category, category: e.category, notes: e.notes });
  }
  for (const s of settlementsOut ?? []) {
    const date = s.created_at.slice(0, 10);
    // Prefer the frozen foreign amount stored at settle time. Fall back to
    // the live rate for legacy rows that pre-date the migration.
    const stored = (s as unknown as { from_foreign_amount?: number | null }).from_foreign_amount;
    const amt = isForeign
      ? (stored != null ? Number(stored) : Number(s.amount) * rate)
      : Number(s.amount);
    const toName = travelerMap[(s as unknown as { to_traveler_id: string }).to_traveler_id] ?? null;
    events.push({ id: s.id, type: "settlement_out", date, created_at: s.created_at, amount: amt, sign: -1, description: "Settlement paid", counterpart: toName });
  }
  for (const p of poolTopups ?? []) {
    const amt = isForeign ? Number(p.foreign_amount ?? Number(p.myr_amount) * rate) : Number(p.myr_amount);
    const poolName = (p as unknown as { pool?: { name: string } }).pool?.name ?? "Pool";
    events.push({ id: p.id, type: "pool_topup", date: p.date, created_at: p.created_at, amount: amt, sign: -1, description: "Pool top-up", notes: p.notes, counterpart: poolName });
  }
  for (const s of settlementsIn ?? []) {
    const date = s.created_at.slice(0, 10);
    const stored = (s as unknown as { to_foreign_amount?: number | null }).to_foreign_amount;
    const amt = isForeign
      ? (stored != null ? Number(stored) : Number(s.amount) * rate)
      : Number(s.amount);
    const fromName = travelerMap[(s as unknown as { from_traveler_id: string }).from_traveler_id] ?? null;
    events.push({ id: s.id, type: "settlement_in", date, created_at: s.created_at, amount: amt, sign: 1, description: "Settlement received", counterpart: fromName });
  }
  // Per-split manual settles paid OUT (we owed someone for an expense and the
  // split was ticked with this wallet as the source). amount is MYR — convert.
  type SplitRow = { id: string; amount: number; traveler_id: string; expense_id: string; expense?: { date?: string; category?: string; paid_by_id?: string; created_at?: string } };
  for (const sp of (splitsOut ?? []) as SplitRow[]) {
    const amtMyr = Number(sp.amount);
    const amt = isForeign ? amtMyr * rate : amtMyr;
    const exp = sp.expense ?? {};
    const date = exp.date ?? new Date().toISOString().slice(0, 10);
    const created_at = exp.created_at ?? date + "T00:00:00.000Z";
    const payeeName = travelerMap[exp.paid_by_id ?? ""] ?? null;
    events.push({
      id: sp.id,
      type: "split_settle_out",
      date,
      created_at,
      amount: amt,
      sign: -1,
      description: `Split settled · ${exp.category ?? ""}`,
      category: exp.category,
      counterpart: payeeName,
    });
  }
  // Per-split manual settles received IN (we paid an expense and someone
  // ticked their split with our wallet as the recipient).
  for (const sp of (splitsIn ?? []) as SplitRow[]) {
    const amtMyr = Number(sp.amount);
    const amt = isForeign ? amtMyr * rate : amtMyr;
    const exp = sp.expense ?? {};
    const date = exp.date ?? new Date().toISOString().slice(0, 10);
    const created_at = exp.created_at ?? date + "T00:00:00.000Z";
    const payerName = travelerMap[sp.traveler_id] ?? null;
    events.push({
      id: sp.id,
      type: "split_settle_in",
      date,
      created_at,
      amount: amt,
      sign: 1,
      description: `Reimbursed · ${exp.category ?? ""}`,
      category: exp.category,
      counterpart: payerName,
    });
  }

  events.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.created_at.localeCompare(b.created_at);
  });

  return NextResponse.json({ events, currency: wallet.currency, isForeign });
}
