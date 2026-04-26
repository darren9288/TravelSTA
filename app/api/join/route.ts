export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const { data: trip, error } = await db()
    .from("trips")
    .select("*")
    .eq("join_code", code.toUpperCase())
    .single();
  if (error || !trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const { data: travelers } = await db()
    .from("travelers")
    .select("*")
    .eq("trip_id", trip.id)
    .eq("is_pool", false)
    .order("created_at");

  return NextResponse.json({ trip, travelers });
}
