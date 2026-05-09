export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireSuperAdmin } from "@/lib/admin";
import { getSessionUser } from "@/lib/supabase-server";

// GET /api/admin/users — list every account in the system.
export async function GET() {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const db = serverDb();

  // List auth users (paginated; default page size 50, we ask for max 1000 to keep it simple).
  const { data: authData, error: authErr } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

  // Fetch profile usernames + super admin flags for the same ids.
  const ids = authData.users.map((u) => u.id);
  const { data: profiles } = await db.from("profiles").select("id, username, is_super_admin").in("id", ids);
  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

  // For each user, count trips they're a member of.
  const { data: members } = await db.from("trip_members").select("user_id").in("user_id", ids);
  const tripCount = (members ?? []).reduce<Record<string, number>>((acc, m) => {
    acc[m.user_id] = (acc[m.user_id] ?? 0) + 1;
    return acc;
  }, {});

  const users = authData.users.map((u) => ({
    id: u.id,
    username: profileMap[u.id]?.username ?? u.email?.replace("@placeholder.com", "") ?? "(unknown)",
    email: u.email ?? null,
    is_super_admin: Boolean(profileMap[u.id]?.is_super_admin),
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    trip_count: tripCount[u.id] ?? 0,
  }));

  // Sort: super admins first, then by created_at desc.
  users.sort((a, b) => {
    if (a.is_super_admin !== b.is_super_admin) return a.is_super_admin ? -1 : 1;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });

  return NextResponse.json({ users });
}

// DELETE /api/admin/users — body: { user_id }. Deletes auth user + profile (cascade clears trip_members).
export async function DELETE(req: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const { user_id } = await req.json();
  if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  // Don't let an admin delete themselves through this endpoint.
  const me = await getSessionUser();
  if (me?.id === user_id) {
    return NextResponse.json({ error: "Cannot delete your own account from the admin panel." }, { status: 400 });
  }

  const db = serverDb();

  // Deleting from auth.users cascades to profiles + trip_members via FK on delete cascade.
  const { error } = await db.auth.admin.deleteUser(user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// PATCH /api/admin/users — body: { user_id, password?: string, is_super_admin?: boolean }
// Used to (re)set a password without knowing the old one, and to grant/revoke super admin.
export async function PATCH(req: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const { user_id, password, is_super_admin } = await req.json();
  if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const db = serverDb();

  if (typeof password === "string" && password.length > 0) {
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }
    const { error } = await db.auth.admin.updateUserById(user_id, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (typeof is_super_admin === "boolean") {
    // Stop an admin from accidentally demoting themselves to a non-admin.
    const me = await getSessionUser();
    if (me?.id === user_id && !is_super_admin) {
      return NextResponse.json({ error: "Cannot revoke your own super admin status." }, { status: 400 });
    }
    const { error } = await db.from("profiles").update({ is_super_admin }).eq("id", user_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
