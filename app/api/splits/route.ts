export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

// Toggle settled status for a single split
export async function PUT(req: NextRequest) {
  const { id, is_settled } = await req.json();
  const { data, error } = await db()
    .from("expense_splits")
    .update({ is_settled })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Bulk-settle: mark all unsettled splits for a traveler in a trip as settled
export async function POST(req: NextRequest) {
  const { trip_id, traveler_id } = await req.json();
  if (!trip_id || !traveler_id) return NextResponse.json({ error: "trip_id and traveler_id required" }, { status: 400 });

  // Get all expense IDs for this trip
  const { data: expenses } = await db().from("expenses").select("id").eq("trip_id", trip_id);
  const expenseIds = (expenses ?? []).map((e: { id: string }) => e.id);
  if (!expenseIds.length) return NextResponse.json({ updated: 0 });

  const { error } = await db()
    .from("expense_splits")
    .update({ is_settled: true })
    .in("expense_id", expenseIds)
    .eq("traveler_id", traveler_id)
    .eq("is_settled", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
