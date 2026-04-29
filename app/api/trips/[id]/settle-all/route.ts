export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { calculateSettlement } from "@/lib/settlement";
import { Traveler, Expense } from "@/lib/supabase";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const tripId = params.id;
  const db = serverDb();

  // 1. Load full trip data to calculate current instructions
  const [travelerRes, expenseRes] = await Promise.all([
    db.from("travelers").select("*").eq("trip_id", tripId),
    db.from("expenses").select("*").eq("trip_id", tripId),
  ]);

  const travelers = travelerRes.data ?? [];
  const expensesRaw = expenseRes.data ?? [];
  const expenseIds = expensesRaw.map((e: { id: string }) => e.id);

  const { data: splits } = await db
    .from("expense_splits")
    .select("*")
    .in("expense_id", expenseIds.length ? expenseIds : ["__none__"]);

  const expenses = expensesRaw.map((e: Expense) => ({
    ...e,
    splits: (splits ?? []).filter((s: { expense_id: string }) => s.expense_id === e.id),
  }));

  // 2. Calculate instructions so we can record them as history
  const { instructions } = calculateSettlement(travelers as Traveler[], expenses as Expense[]);

  // 3. Record each instruction as a settlement_payment (history)
  if (instructions.length > 0) {
    await db.from("settlement_payments").insert(
      instructions.map((inst) => ({
        trip_id: tripId,
        from_traveler_id: inst.from.id,
        to_traveler_id: inst.to.id,
        amount: inst.amount,
        from_wallet_id: null,
        to_wallet_id: null,
      }))
    );
  }

  // 4. Lock and settle all remaining unsettled splits
  if (expenseIds.length > 0) {
    const { error } = await db
      .from("expense_splits")
      .update({ is_settled: true, locked: true })
      .in("expense_id", expenseIds)
      .eq("is_settled", false);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
