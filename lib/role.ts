import { serverDb } from "./supabase";
import { getSessionUser } from "./supabase-server";
import { NextResponse } from "next/server";

/** Returns the current user's role for a trip, or null if not a member / not logged in. */
export async function getUserRole(tripId: string): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const { data } = await serverDb()
    .from("trip_members")
    .select("role")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .single();
  return data?.role ?? null;
}

/** Returns true if the role can create/edit/delete data (admin or editor). */
export function canEdit(role: string | null): boolean {
  return role === "admin" || role === "editor";
}

/** Convenience: returns a 403 response if the user cannot edit. */
export async function requireEditor(tripId: string): Promise<NextResponse | null> {
  const role = await getUserRole(tripId);
  if (!canEdit(role)) {
    return NextResponse.json({ error: "Viewers cannot make changes" }, { status: 403 });
  }
  return null;
}
