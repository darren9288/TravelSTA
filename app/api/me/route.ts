export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase-server";

// GET /api/me — returns the current signed-in user's id, or null.
// Used by client components that need to know "who am I" without hitting
// the full /api/trips/[id] endpoint (which returns trip-scoped data).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({ user: { id: user.id, email: user.email ?? null } });
}
