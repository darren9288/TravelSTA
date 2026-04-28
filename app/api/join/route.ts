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

  // Check if already a member (preserve existing role)
  const { data: existing } = await db
    .from("trip_members")
    .select("role")
    .eq("trip_id", trip_id)
    .eq("user_id", user.id)
    .single();

  if (existing) {
    // Already a member — only update traveler_id, never downgrade role
    const { error } = await db
      .from("trip_members")
      .update({ traveler_id: traveler_id ?? null })
      .eq("trip_id", trip_id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // New member — insert as viewer
    const { error } = await db.from("trip_members").insert({
      trip_id,
      user_id: user.id,
      traveler_id: traveler_id ?? null,
      role: "viewer",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
