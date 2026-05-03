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

// ── Trip-ID lookup helpers ────────────────────────────────────────────────────

/** Look up trip_id from a row in any table that has a trip_id column directly. */
export async function tripIdFrom(
  table: "wallets" | "wallet_topups" | "travelers" | "settlement_payments" | "pool_topups",
  id: string
): Promise<string | null> {
  const { data } = await serverDb().from(table).select("trip_id").eq("id", id).single();
  return (data as { trip_id?: string } | null)?.trip_id ?? null;
}

/** Look up trip_id for an expense_split (split → expense → trip). */
export async function tripIdForSplit(splitId: string): Promise<string | null> {
  const db = serverDb();
  const { data: split } = await db.from("expense_splits").select("expense_id").eq("id", splitId).single();
  if (!split?.expense_id) return null;
  const { data: exp } = await db.from("expenses").select("trip_id").eq("id", split.expense_id).single();
  return (exp as { trip_id?: string } | null)?.trip_id ?? null;
}
