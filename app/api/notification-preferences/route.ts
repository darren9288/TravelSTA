export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";

// Per-user, per-trip notification preferences.
// GET  /api/notification-preferences?trip_id=xxx → returns { interval_minutes }
// PUT  /api/notification-preferences            → body: { trip_id, interval_minutes }
//
// interval_minutes legal values: 0 (Frequent), 1 (Medium), 5 (Low), -1 (Off).

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tripId = new URL(req.url).searchParams.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const { data } = await serverDb()
    .from("user_notification_preferences")
    .select("interval_minutes")
    .eq("user_id", me.id)
    .eq("trip_id", tripId)
    .maybeSingle();

  // Default to Frequent (0) if no row exists yet.
  return NextResponse.json({ interval_minutes: (data as { interval_minutes?: number } | null)?.interval_minutes ?? 0 });
}

export async function PUT(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tripId = body.trip_id as string | undefined;
  const interval = Number(body.interval_minutes);
  if (!tripId) return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  if (![-1, 0, 1, 5].includes(interval)) {
    return NextResponse.json({ error: "interval_minutes must be -1, 0, 1, or 5" }, { status: 400 });
  }

  const { error } = await serverDb()
    .from("user_notification_preferences")
    .upsert(
      { user_id: me.id, trip_id: tripId, interval_minutes: interval, updated_at: new Date().toISOString() },
      { onConflict: "user_id,trip_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, interval_minutes: interval });
}
