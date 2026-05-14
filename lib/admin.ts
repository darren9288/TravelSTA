import { NextResponse } from "next/server";
import { serverDb } from "./supabase";
import { getSessionUser } from "./supabase-server";

// Returns true if the currently signed-in user has profiles.is_super_admin = true.
export async function isSuperAdmin(): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  const db = serverDb();
  const { data } = await db
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();
  return Boolean(data?.is_super_admin);
}

// Use in admin API routes — short-circuits with 401/403 if the caller is not a super admin.
// Returns null when the caller is allowed, or a NextResponse to return immediately otherwise.
export async function requireSuperAdmin(): Promise<NextResponse | null> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = serverDb();
  const { data } = await db
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();
  if (!data?.is_super_admin) {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }
  return null;
}
