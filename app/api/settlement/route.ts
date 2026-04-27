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
    supabase.from("expenses").select("*").eq("trip_id", tripId),
  ]);

  if (travelerRes.error) {
    return NextResponse.json({ error: travelerRes.error.message, _debug: { stage: "travelers" } }, { status: 500 });
  }
  if (expenseRes.error) {
    return NextResponse.json({ error: expenseRes.error.message, _debug: { stage: "expenses" } }, { status: 500 });
  }

  const travelers = travelerRes.data ?? [];
  const expensesRaw = expenseRes.data ?? [];
  const expenseIds = expensesRaw.map((e) => e.id);

  // Fetch splits directly — avoids PostgREST nested join returning stale is_settled values
  const { data: splitsRaw, error: splitError } = await supabase
    .from("expense_splits")
    .select("*")
    .in("expense_id", expenseIds.length ? expenseIds : ["__none__"]);

  if (splitError) {
    return NextResponse.json({ error: splitError.message, _debug: { stage: "splits" } }, { status: 500 });
  }

  const splits = splitsRaw ?? [];

  // Attach splits to expenses
  const expenses = expensesRaw.map((e) => ({
    ...e,
    splits: splits.filter((s) => s.expense_id === e.id),
  }));

  const result = calculateSettlement(travelers as Traveler[], expenses as Expense[]);

  return NextResponse.json(
    {
      ...result,
      _debug: {
        traveler_count: travelers.length,
        expense_count: expenses.length,
        split_count: splits.length,
        unsettled_count: splits.filter((s) => !s.is_settled).length,
      },
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" } }
  );
}
