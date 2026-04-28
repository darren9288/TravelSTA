export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const supabase = serverDb();
  const { data: trip, error } = await supabase
    .from("trips")
    .select("*")
    .eq("join_code", code.toUpperCase())
    .single();
  if (error || !trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const { data: travelers } = await supabase
    .from("travelers")
    .select("*")
    .eq("trip_id", trip.id)
    .eq("is_pool", false)
    .order("created_at");

  return NextResponse.json({ trip, travelers });
}

// Called when a user picks their traveler identity in the join flow
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { trip_id, traveler_id } = await req.json();
  if (!trip_id) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const db = serverDb();

  // Upsert: add user to trip_members as viewer (or update traveler_id if already a member)
  const { error } = await db.from("trip_members").upsert({
    trip_id,
    user_id: user.id,
    traveler_id: traveler_id ?? null,
    role: "viewer",
  }, { onConflict: "trip_id,user_id", ignoreDuplicates: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
