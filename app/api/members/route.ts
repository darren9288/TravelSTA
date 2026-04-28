export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";

// GET /api/members?trip_id=X — returns all members + current user's role
export async function GET(req: NextRequest) {
  const trip_id = new URL(req.url).searchParams.get("trip_id");
  if (!trip_id) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = serverDb();

  // Check current user is a member of this trip
  const { data: me } = await db
    .from("trip_members")
    .select("role")
    .eq("trip_id", trip_id)
    .eq("user_id", user.id)
    .single();

  if (!me) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  // Fetch all members with their profiles
  const { data: members, error } = await db
    .from("trip_members")
    .select("user_id, role, traveler_id, profiles(username)")
    .eq("trip_id", trip_id)
    .order("role");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ members, my_role: me.role });
}

// PATCH /api/members — change a member's role (admin only)
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { trip_id, user_id, role } = await req.json();
  if (!trip_id || !user_id || !role) return NextResponse.json({ error: "trip_id, user_id, role required" }, { status: 400 });
  if (!["admin", "editor", "viewer"].includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const db = serverDb();

  // Only admins can change roles
  const { data: me } = await db.from("trip_members").select("role").eq("trip_id", trip_id).eq("user_id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  // Prevent demoting yourself if you're the only admin
  if (user_id === user.id && role !== "admin") {
    const { data: admins } = await db.from("trip_members").select("user_id").eq("trip_id", trip_id).eq("role", "admin");
    if ((admins?.length ?? 0) <= 1) return NextResponse.json({ error: "Cannot remove the only admin" }, { status: 400 });
  }

  const { error } = await db.from("trip_members").update({ role }).eq("trip_id", trip_id).eq("user_id", user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/members — remove a member (admin only)
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { trip_id, user_id } = await req.json();
  if (!trip_id || !user_id) return NextResponse.json({ error: "trip_id, user_id required" }, { status: 400 });

  const db = serverDb();

  const { data: me } = await db.from("trip_members").select("role").eq("trip_id", trip_id).eq("user_id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  // Prevent removing the only admin
  if (user_id === user.id) {
    const { data: admins } = await db.from("trip_members").select("user_id").eq("trip_id", trip_id).eq("role", "admin");
    if ((admins?.length ?? 0) <= 1) return NextResponse.json({ error: "Cannot remove the only admin" }, { status: 400 });
  }

  const { error } = await db.from("trip_members").delete().eq("trip_id", trip_id).eq("user_id", user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
