export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

// POST /api/trips/[id]/settle-all
// Marks every unsettled expense split in the trip as settled.
// Only call this when all settlement payments have been recorded (net ≈ 0 for everyone).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tripId = params.id;
  const db = serverDb();

  const { data: expenses } = await db
    .from("expenses")
    .select("id")
    .eq("trip_id", tripId);

  const expenseIds = (expenses ?? []).map((e: { id: string }) => e.id);
  if (!expenseIds.length) return NextResponse.json({ updated: 0 });

  const { error } = await db
    .from("expense_splits")
    .update({ is_settled: true })
    .in("expense_id", expenseIds)
    .eq("is_settled", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
