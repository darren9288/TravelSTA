export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

export type WalletEvent = {
  id: string;
  type: "topup" | "expense" | "settlement_out" | "settlement_in";
  date: string;
  created_at: string;
  amount: number; // in wallet's native currency, always positive
  sign: 1 | -1;  // +1 = money in, -1 = money out
  description: string;
  category?: string;
  notes?: string | null;
  counterpart?: string | null; // traveler name for settlement events
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

  const [{ data: topups }, { data: expenses }, { data: splitsOut }, { data: splitsIn }, { data: travelers }] = await Promise.all([
    db.from("wallet_topups").select("id, amount, date, notes, created_at").eq("wallet_id", wallet_id).order("date"),
    db.from("expenses").select("id, date, myr_amount, foreign_amount, category, notes, created_at").eq("wallet_id", wallet_id).order("date"),
    db.from("expense_splits")
      .select("id, amount, expense_id, expenses!inner(date, category, notes, paid_by_id, created_at)")
      .eq("from_wallet_id", wallet_id)
      .eq("is_settled", true),
    db.from("expense_splits")
      .select("id, amount, expense_id, traveler_id, expenses!inner(date, category, notes, created_at)")
      .eq("to_wallet_id", wallet_id)
      .eq("is_settled", true),
    db.from("travelers").select("id, name").eq("trip_id", trip_id),
  ]);

  const travelerMap: Record<string, string> = {};
  for (const t of travelers ?? []) travelerMap[t.id] = t.name;

  const events: WalletEvent[] = [];

  for (const t of topups ?? []) {
    events.push({ id: t.id, type: "topup", date: t.date, created_at: t.created_at, amount: Number(t.amount), sign: 1, description: "Top-up", notes: t.notes });
  }
  for (const e of expenses ?? []) {
    const amt = isForeign ? Number(e.foreign_amount ?? 0) : Number(e.myr_amount);
    events.push({ id: e.id, type: "expense", date: e.date, created_at: e.created_at, amount: amt, sign: -1, description: e.category, category: e.category, notes: e.notes });
  }
  for (const s of splitsOut ?? []) {
    const exp = (s as unknown as { expenses: { date: string; category: string; notes: string | null; paid_by_id: string; created_at: string } }).expenses;
    const amt = Number(s.amount) * rate;
    const toName = travelerMap[exp?.paid_by_id] ?? null;
    events.push({ id: s.id, type: "settlement_out", date: exp?.date ?? "", created_at: exp?.created_at ?? "", amount: amt, sign: -1, description: "Settlement paid", category: exp?.category, notes: exp?.notes, counterpart: toName });
  }
  for (const s of splitsIn ?? []) {
    const exp = (s as unknown as { expenses: { date: string; category: string; notes: string | null; created_at: string } }).expenses;
    const travelerId = (s as unknown as { traveler_id: string }).traveler_id;
    const amt = Number(s.amount) * rate;
    const fromName = travelerMap[travelerId] ?? null;
    events.push({ id: s.id, type: "settlement_in", date: exp?.date ?? "", created_at: exp?.created_at ?? "", amount: amt, sign: 1, description: "Settlement received", category: exp?.category, notes: exp?.notes, counterpart: fromName });
  }

  events.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.created_at.localeCompare(b.created_at);
  });

  return NextResponse.json({ events, currency: wallet.currency, isForeign });
}
