export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { calculateSettlement } from "@/lib/settlement";
import { Expense, Traveler } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const tripId = new URL(req.url).searchParams.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const supabase = serverDb();

  const [travelerRes, expenseRes] = await Promise.all([
    supabase.from("travelers").select("*").eq("trip_id", tripId),
    supabase.from("expenses").select("*").eq("trip_id", tripId),
  ]);

  if (travelerRes.error) return NextResponse.json({ error: travelerRes.error.message }, { status: 500 });
  if (expenseRes.error) return NextResponse.json({ error: expenseRes.error.message }, { status: 500 });

  const travelers = travelerRes.data ?? [];
  const expensesRaw = expenseRes.data ?? [];
  const expenseIds = expensesRaw.map((e) => e.id);

  const { data: splitsRaw, error: splitError } = await supabase
    .from("expense_splits")
    .select("*")
    .in("expense_id", expenseIds.length ? expenseIds : ["__none__"]);

  if (splitError) return NextResponse.json({ error: splitError.message }, { status: 500 });

  const expenses = expensesRaw.map((e) => ({
    ...e,
    splits: (splitsRaw ?? []).filter((s) => s.expense_id === e.id),
  }));

  const result = calculateSettlement(travelers as Traveler[], expenses as Expense[]);

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" },
  });
}
