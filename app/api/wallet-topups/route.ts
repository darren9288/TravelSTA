export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const wallet_id = new URL(req.url).searchParams.get("wallet_id");
  if (!wallet_id) return NextResponse.json({ error: "wallet_id required" }, { status: 400 });

  const { data, error } = await serverDb()
    .from("wallet_topups")
    .select("*")
    .eq("wallet_id", wallet_id)
    .order("date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await serverDb().from("wallet_topups").insert({
    wallet_id: body.wallet_id,
    trip_id: body.trip_id,
    amount: body.amount,
    date: body.date,
    notes: body.notes ?? null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await serverDb().from("wallet_topups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
