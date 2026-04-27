export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateSettlement } from "@/lib/settlement";
import { Expense, Traveler } from "@/lib/supabase";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export async function GET(req: NextRequest) {
  const tripId = new URL(req.url).searchParams.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const supabase = db();

  const [travelerRes, expenseRes] = await Promise.all([
    supabase.from("travelers").select("*").eq("trip_id", tripId),
    // Use the same explicit join syntax as the expenses tab — avoids ambiguous FK issues
    supabase
      .from("expenses")
      .select("*, paid_by:travelers!paid_by_id(*), splits:expense_splits(*)")
      .eq("trip_id", tripId),
  ]);

  if (travelerRes.error) {
    return NextResponse.json({ error: travelerRes.error.message, _debug: { stage: "travelers" } }, { status: 500 });
  }
  if (expenseRes.error) {
    return NextResponse.json({ error: expenseRes.error.message, _debug: { stage: "expenses" } }, { status: 500 });
  }

  const travelers = travelerRes.data ?? [];
  const expenses = expenseRes.data ?? [];

  const result = calculateSettlement(travelers as Traveler[], expenses as Expense[]);

  const allSplits = expenses.flatMap((e) => (e as Expense & { splits?: unknown[] }).splits ?? []) as { is_settled: unknown }[];

  return NextResponse.json({
    ...result,
    _debug: {
      traveler_count: travelers.length,
      expense_count: expenses.length,
      split_count: allSplits.length,
      unsettled_count: allSplits.filter((s) => !s.is_settled).length,
      sample_split: allSplits[0] ?? null,
    },
  });
}
