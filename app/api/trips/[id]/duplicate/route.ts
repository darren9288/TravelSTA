export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = serverDb();
  const user = await getSessionUser();

  // Fetch original trip
  const { data: trip, error: tripError } = await db
    .from("trips")
    .select("*")
    .eq("id", params.id)
    .single();

  if (tripError || !trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  // Create new trip
  const { id: _oldId, created_at: _ca, join_code: _jc, ...tripFields } = trip;
  const { data: newTrip, error: newTripError } = await db
    .from("trips")
    .insert({
      ...tripFields,
      name: `Copy of ${trip.name}`,
      // Generate a random join code
      join_code: Math.random().toString(36).slice(2, 8).toUpperCase(),
    })
    .select()
    .single();

  if (newTripError || !newTrip) {
    return NextResponse.json({ error: newTripError?.message ?? "Failed to create trip" }, { status: 500 });
  }

  // Copy travelers (not pool travelers)
  const { data: travelers } = await db
    .from("travelers")
    .select("*")
    .eq("trip_id", params.id)
    .eq("is_pool", false);

  const travelerIdMap = new Map<string, string>(); // old -> new

  if (travelers?.length) {
    for (const t of travelers) {
      const { id: _tid, created_at: _tca, trip_id: _tripId, ...tFields } = t;
      const { data: newT } = await db
        .from("travelers")
        .insert({ ...tFields, trip_id: newTrip.id })
        .select()
        .single();
      if (newT) travelerIdMap.set(t.id, newT.id);
    }
  }

  // Copy wallets (without top-ups)
  const { data: wallets } = await db
    .from("wallets")
    .select("*")
    .eq("trip_id", params.id);

  if (wallets?.length) {
    for (const w of wallets) {
      const { id: _wid, created_at: _wca, trip_id: _wTripId, ...wFields } = w;
      const newTravelerId = w.traveler_id ? travelerIdMap.get(w.traveler_id) : null;
      await db.from("wallets").insert({
        ...wFields,
        trip_id: newTrip.id,
        traveler_id: newTravelerId ?? w.traveler_id,
      });
    }
  }

  // Add current user as admin member of new trip if logged in
  if (user) {
    // Find the matching traveler in the new trip for this user (if they had one in the original)
    const { data: origMember } = await db
      .from("trip_members")
      .select("traveler_id, role")
      .eq("trip_id", params.id)
      .eq("user_id", user.id)
      .single();

    const newTravelerId = origMember?.traveler_id
      ? travelerIdMap.get(origMember.traveler_id) ?? null
      : null;

    await db.from("trip_members").insert({
      trip_id: newTrip.id,
      user_id: user.id,
      role: "admin",
      traveler_id: newTravelerId,
    });
  }

  return NextResponse.json({ id: newTrip.id, name: newTrip.name });
}
