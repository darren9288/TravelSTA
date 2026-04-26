export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export async function GET(req: NextRequest) {
  const tripId = new URL(req.url).searchParams.get("trip_id");
  let q = db().from("travelers").select("*").order("created_at");
  if (tripId) q = q.eq("trip_id", tripId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const rows = Array.isArray(body) ? body : [body];
  const { data, error } = await db().from("travelers").insert(
    rows.map((r) => ({
      trip_id: r.trip_id,
      name: r.name,
      color: r.color ?? "#6366f1",
      is_pool: r.is_pool ?? false,
      pool_currency: r.pool_currency ?? null,
    }))
  ).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await db().from("travelers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
