export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase-server";
import { logActivity, type ActivityAction } from "@/lib/activity-log";

// POST /api/activity/log
// Body: { action: ActivityAction, trip_id?: string, details?: object }
// Client-side logger endpoint for page views and any UI interactions
// that aren't otherwise captured server-side. The session user is the
// actor — clients can't impersonate other users.

const ALLOWED_ACTIONS = new Set<ActivityAction>([
  "page_view",
  "ai_ask",
  "ai_parse_expense",
  "ai_parse_receipt",
  "ai_recap",
  "ai_categorize",
  "ai_suggest",
  "notification_pref_change",
  "push_subscribe",
  "push_unsubscribe",
  "other",
]);

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as ActivityAction;
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Unknown or disallowed action" }, { status: 400 });
  }

  // Fire-and-forget so the client never waits on logging.
  void logActivity({
    action,
    userId: user.id,
    tripId: typeof body.trip_id === "string" ? body.trip_id : null,
    details: typeof body.details === "object" && body.details ? body.details : {},
    req,
  });

  return NextResponse.json({ ok: true });
}
