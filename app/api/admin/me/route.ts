export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin";

// GET /api/admin/me — does the current user have super admin status?
// Used by client UIs to decide whether to show admin links/panels.
export async function GET() {
  const ok = await isSuperAdmin();
  return NextResponse.json({ is_super_admin: ok });
}
