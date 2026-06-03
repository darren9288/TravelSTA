export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";

// GET /api/join/membership?code=<CODE>
// Returns:
//   { member: { role, traveler_id } | null,  claimed_traveler_ids: string[] }
//
// - member: current session user's trip_members row for this trip (if any)
// - claimed_traveler_ids: every traveler_id already bound to some user_id
//   in this trip. Used by the join picker to disable rows that someone else
//   already grabbed (prevents two accounts hijacking the same identity).
//
// 401 if not signed in. 404 if the code doesn't match any trip.

export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = serverDb();
  const { data: trip } = await db
    .from("trips")
    .select("id")
    .eq("join_code", code.toUpperCase())
    .single();
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  // Look up the current user's existing membership (if any).
  const { data: member } = await db
    .from("trip_members")
    .select("role, traveler_id")
    .eq("trip_id", trip.id)
    .eq("user_id", user.id)
    .maybeSingle();

  // Find every traveler already claimed by some user in this trip — used by
  // the picker to grey out rows. Exclude the current user's own claim from
  // the "claimed" list so they can re-pick their own slot if needed.
  const { data: claims } = await db
    .from("trip_members")
    .select("traveler_id, user_id")
    .eq("trip_id", trip.id)
    .not("traveler_id", "is", null);

  const claimed_traveler_ids = (claims ?? [])
    .filter((c: { user_id: string; traveler_id: string | null }) => c.user_id !== user.id && c.traveler_id)
    .map((c: { traveler_id: string }) => c.traveler_id);

  return NextResponse.json({
    member: member ?? null,
    claimed_traveler_ids,
  });
}
