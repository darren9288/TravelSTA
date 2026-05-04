export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { calculateSettlement } from "@/lib/settlement";
import { Traveler, Expense } from "@/lib/supabase";
import { requireEditor } from "@/lib/role";

type WalletSelection = {
  from_wallet_id: string | null;
  to_wallet_id: string | null;
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tripId = params.id;
  const denied = await requireEditor(tripId);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const walletSelections: Record<number, WalletSelection> = body.walletSelections ?? {};
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

  // 3. Record each instruction as a settlement_payment (history) with wallet selections
  if (instructions.length > 0) {
    await db.from("settlement_payments").insert(
      instructions.map((inst, i) => ({
        trip_id: tripId,
        from_traveler_id: inst.from.id,
        to_traveler_id: inst.to.id,
        amount: inst.amount,
        from_wallet_id: walletSelections[i]?.from_wallet_id ?? null,
        to_wallet_id: walletSelections[i]?.to_wallet_id ?? null,
      }))
    );
  }

  // 4. Mark ALL unsettled splits as settled.
  // Net transfers are already recorded in settlement_payments above.
  // The per-split wallet tracking is not used for balance calculation — settlement_payments is.
  if (expenseIds.length > 0) {
    await db
      .from("expense_splits")
      .update({ is_settled: true, locked: true })
      .in("expense_id", expenseIds)
      .eq("is_settled", false);
  }

  return NextResponse.json({ success: true });
}
