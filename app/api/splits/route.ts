export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

export async function PUT(req: NextRequest) {
  const { id, is_settled, from_wallet_id, to_wallet_id } = await req.json();
  const update: Record<string, unknown> = { is_settled };
  if (is_settled) {
    update.from_wallet_id = from_wallet_id ?? null;
    update.to_wallet_id = to_wallet_id ?? null;
  } else {
    // Unsettling — clear wallet links
    update.from_wallet_id = null;
    update.to_wallet_id = null;
  }
  const { data, error } = await serverDb()
    .from("expense_splits")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { trip_id, traveler_id, from_wallet_id, to_wallet_id } = await req.json();
  if (!trip_id || !traveler_id) return NextResponse.json({ error: "trip_id and traveler_id required" }, { status: 400 });

  const supabase = serverDb();
  const { data: expenses } = await supabase.from("expenses").select("id").eq("trip_id", trip_id);
  const expenseIds = (expenses ?? []).map((e: { id: string }) => e.id);
  if (!expenseIds.length) return NextResponse.json({ updated: 0 });

  const update: Record<string, unknown> = {
    is_settled: true,
    from_wallet_id: from_wallet_id ?? null,
    to_wallet_id: to_wallet_id ?? null,
  };

  const { error } = await supabase
    .from("expense_splits")
    .update(update)
    .in("expense_id", expenseIds)
    .eq("traveler_id", traveler_id)
    .eq("is_settled", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
