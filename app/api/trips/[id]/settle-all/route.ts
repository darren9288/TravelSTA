export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { calculateSettlement } from "@/lib/settlement";
import { Traveler, Expense } from "@/lib/supabase";
import { requireEditor } from "@/lib/role";
import { getSessionUser } from "@/lib/supabase-server";
import { sendPushToTripMembers } from "@/lib/push";
import { logActivity } from "@/lib/activity-log";

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

  // 3. Record each instruction as a settlement_payment (history) with wallet selections.
  // We also freeze each side's foreign-currency equivalent so a later rate change
  // in trip settings doesn't retroactively alter the displayed JPY in wallet history.
  if (instructions.length > 0) {
    // Look up wallet metadata for all the wallets referenced in this batch.
    const walletIds = Array.from(
      new Set(
        Object.values(walletSelections)
          .flatMap((s) => [s?.from_wallet_id, s?.to_wallet_id])
          .filter(Boolean) as string[]
      )
    );
    let walletMap: Record<string, { currency: string; name: string }> = {};
    if (walletIds.length) {
      const { data: wallets } = await db
        .from("wallets")
        .select("id, currency, name")
        .in("id", walletIds);
      walletMap = Object.fromEntries(
        (wallets ?? []).map((w: { id: string; currency: string; name: string }) => [
          w.id,
          { currency: w.currency, name: w.name },
        ])
      );
    }

    // Fetch trip rates once for the conversion (both foreign-currency pairs).
    const { data: trip } = await db
      .from("trips")
      .select("cash_rate, wise_rate, foreign_currency_2, cash_rate_2, wise_rate_2")
      .eq("id", tripId)
      .single();
    const cashRate = Number(trip?.cash_rate ?? 1);
    const wiseRate = Number(trip?.wise_rate ?? 1);
    const cashRate2 = Number(trip?.cash_rate_2 ?? 1);
    const wiseRate2 = Number(trip?.wise_rate_2 ?? 1);
    const foreignCurrency2 = trip?.foreign_currency_2 ?? null;

    // Foreign equivalent for a wallet: amount × wallet's rate. Returns null if
    // the wallet is MYR or unknown (no conversion needed). Uses the second
    // currency's rate pair when the wallet is in foreign_currency_2.
    function foreignFor(walletId: string | null, amountMyr: number): number | null {
      if (!walletId) return null;
      const w = walletMap[walletId];
      if (!w || w.currency === "MYR") return null;
      const isWise = w.name.toLowerCase().includes("wise");
      const rate = (foreignCurrency2 && w.currency === foreignCurrency2)
        ? (isWise ? wiseRate2 : cashRate2)
        : (isWise ? wiseRate : cashRate);
      return parseFloat((amountMyr * rate).toFixed(2));
    }

    await db.from("settlement_payments").insert(
      instructions.map((inst, i) => {
        const fromWalletId = walletSelections[i]?.from_wallet_id ?? null;
        const toWalletId = walletSelections[i]?.to_wallet_id ?? null;
        return {
          trip_id: tripId,
          from_traveler_id: inst.from.id,
          to_traveler_id: inst.to.id,
          amount: inst.amount,
          from_wallet_id: fromWalletId,
          to_wallet_id: toWalletId,
          from_foreign_amount: foreignFor(fromWalletId, inst.amount),
          to_foreign_amount: foreignFor(toWalletId, inst.amount),
        };
      })
    );
  }

  // 4. Mark ALL unsettled splits as settled.
  // Net transfers are already recorded in settlement_payments above.
  // The per-split wallet tracking is not used for balance calculation — settlement_payments is.
  if (expenseIds.length > 0) {
    await db
      .from("expense_splits")
      .update({ is_settled: true, locked: true, lock_source: "settle_all" })
      .in("expense_id", expenseIds)
      .eq("is_settled", false);
  }

  // Activity log for super-admin review.
  {
    const meUser = await getSessionUser();
    void logActivity({
      action: "settle_all",
      userId: meUser?.id ?? null,
      tripId,
      details: { instruction_count: instructions.length },
      req,
    });
  }

  // Fire push to every trip member except the user who pressed Settle All.
  // Wrapped so push failures can never break the actual settle flow.
  try {
    const me = await getSessionUser();
    const { data: trip } = await db.from("trips").select("name").eq("id", tripId).single();
    const tripName = trip?.name ?? "your trip";
    const count = instructions.length;
    void sendPushToTripMembers(
      tripId,
      {
        title: `Settle All done — ${tripName}`,
        body: count > 0
          ? `${count} transfer${count === 1 ? "" : "s"} recorded. Tap to see who paid whom.`
          : "Everyone is square — no transfers needed.",
        url: `/trips/${tripId}/settlement`,
        tag: `settle-${tripId}`,
      },
      me?.id,
      { category: "settle_all" }
    ).catch((e: unknown) => console.error("[push.settle-all]", (e as Error).message));
  } catch (e) {
    console.error("[push.settle-all] setup failed:", (e as Error).message);
  }

  return NextResponse.json({ success: true });
}
