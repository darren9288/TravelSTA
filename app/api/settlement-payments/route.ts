export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

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
  const { data, error } = await serverDb()
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
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await serverDb().from("settlement_payments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
