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
  const [{ data: travelers }, { data: expenses }] = await Promise.all([
    supabase.from("travelers").select("*").eq("trip_id", tripId),
    supabase.from("expenses").select("*, splits:expense_splits(*)").eq("trip_id", tripId),
  ]);

  if (!travelers || !expenses) return NextResponse.json({ error: "Failed to load data" }, { status: 500 });

  const result = calculateSettlement(travelers as Traveler[], expenses as Expense[]);
  return NextResponse.json(result);
}
