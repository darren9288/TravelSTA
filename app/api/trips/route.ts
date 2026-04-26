export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

function randomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function GET() {
  const { data, error } = await db().from("trips").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  let join_code = randomCode();
  // ensure unique
  const supabase = db();
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.from("trips").select("id").eq("join_code", join_code).single();
    if (!data) break;
    join_code = randomCode();
  }
  const { data, error } = await supabase.from("trips").insert({
    name: body.name,
    destination: body.destination ?? "",
    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,
    foreign_currency: body.foreign_currency ?? "JPY",
    cash_rate: body.cash_rate ?? 1,
    wise_rate: body.wise_rate ?? 1,
    join_code,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
