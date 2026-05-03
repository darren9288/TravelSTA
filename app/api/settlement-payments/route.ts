export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor } from "@/lib/role";

export async function GET(req: NextRequest) {
  const trip_id = new URL(req.url).searchParams.get("trip_id");
  if (!trip_id) return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  const { data, error } = await serverDb()
    .from("settlement_payments")
    .select("*")
    .eq("trip_id", trip_id)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payments: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { trip_id, from_traveler_id, to_traveler_id, amount, from_wallet_id, to_wallet_id } = await req.json();
  if (!trip_id || !from_traveler_id || !to_traveler_id || !amount) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  const denied = await requireEditor(trip_id); if (denied) return denied;

  const db = serverDb();

  // 1. Record the settlement payment
  const { data, error } = await db
    .from("settlement_payments")
    .insert({
      trip_id,
      from_traveler_id,
      to_traveler_id,
      amount,
      from_wallet_id: from_wallet_id ?? null,
      to_wallet_id: to_wallet_id ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 2. Also mark the payer's (from) splits on the receiver's (to) expenses as settled.
  //    This keeps the expense tab in sync — "Cristo paid Darren" settles Cristo's splits
  //    on all of Darren's expenses.
  const { data: toExpenses } = await db
    .from("expenses")
    .select("id")
    .eq("trip_id", trip_id)
    .eq("paid_by_id", to_traveler_id);

  const toExpenseIds = (toExpenses ?? []).map((e: { id: string }) => e.id);

  if (toExpenseIds.length > 0) {
    await db
      .from("expense_splits")
      .update({
        is_settled: true,
        from_wallet_id: from_wallet_id ?? null,
        to_wallet_id: to_wallet_id ?? null,
      })
      .in("expense_id", toExpenseIds)
      .eq("traveler_id", from_traveler_id)
      .eq("is_settled", false);
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = serverDb();

  // Fetch the payment first so we can reverse the expense split settlement
  const { data: payment } = await db
    .from("settlement_payments")
    .select("*")
    .eq("id", id)
    .single();

  if (payment?.trip_id) { const denied = await requireEditor(payment.trip_id); if (denied) return denied; }

  // Delete the payment record
  const { error } = await db.from("settlement_payments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Reverse: un-settle the from_traveler's splits on the to_traveler's expenses
  if (payment) {
    const { data: toExpenses } = await db
      .from("expenses")
      .select("id")
      .eq("trip_id", payment.trip_id)
      .eq("paid_by_id", payment.to_traveler_id);

    const toExpenseIds = (toExpenses ?? []).map((e: { id: string }) => e.id);

    if (toExpenseIds.length > 0) {
      await db
        .from("expense_splits")
        .update({ is_settled: false, from_wallet_id: null, to_wallet_id: null })
        .in("expense_id", toExpenseIds)
        .eq("traveler_id", payment.from_traveler_id)
        .eq("is_settled", true);
    }
  }

  return NextResponse.json({ success: true });
}
