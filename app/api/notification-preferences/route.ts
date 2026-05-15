export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";

// Per-user, per-trip notification preferences.
// GET  /api/notification-preferences?trip_id=xxx → returns { interval_minutes, detail_level }
// PUT  /api/notification-preferences            → body: { trip_id, interval_minutes?, detail_level? }
//
// interval_minutes legal values: 0 (Frequent), 1 (Medium), 5 (Low), -1 (Off).
// detail_level legal values: 'summary' (counts) or 'detailed' (per-event bullets).
//   The detail_level only matters when interval_minutes > 0 (batched).

type DetailLevel = "summary" | "detailed";

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tripId = new URL(req.url).searchParams.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const { data } = await serverDb()
    .from("user_notification_preferences")
    .select("interval_minutes, detail_level")
    .eq("user_id", me.id)
    .eq("trip_id", tripId)
    .maybeSingle();

  const row = data as { interval_minutes?: number; detail_level?: DetailLevel } | null;
  return NextResponse.json({
    interval_minutes: row?.interval_minutes ?? 0,
    detail_level: row?.detail_level ?? "summary",
  });
}

export async function PUT(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tripId = body.trip_id as string | undefined;
  if (!tripId) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  // Pull the existing row so we can do partial updates (PUT either field).
  const db = serverDb();
  const { data: existing } = await db
    .from("user_notification_preferences")
    .select("interval_minutes, detail_level")
    .eq("user_id", me.id)
    .eq("trip_id", tripId)
    .maybeSingle();
  const existingRow = existing as { interval_minutes?: number; detail_level?: DetailLevel } | null;

  // Apply the diff. Either field can be omitted; we'll keep the previous
  // value (or defaults) in that case.
  let interval = existingRow?.interval_minutes ?? 0;
  if (body.interval_minutes != null) {
    const n = Number(body.interval_minutes);
    if (![-1, 0, 1, 5].includes(n)) {
      return NextResponse.json({ error: "interval_minutes must be -1, 0, 1, or 5" }, { status: 400 });
    }
    interval = n;
  }

  let detailLevel: DetailLevel = existingRow?.detail_level ?? "summary";
  if (body.detail_level != null) {
    if (body.detail_level !== "summary" && body.detail_level !== "detailed") {
      return NextResponse.json({ error: "detail_level must be 'summary' or 'detailed'" }, { status: 400 });
    }
    detailLevel = body.detail_level;
  }

  const { error } = await db
    .from("user_notification_preferences")
    .upsert(
      {
        user_id: me.id,
        trip_id: tripId,
        interval_minutes: interval,
        detail_level: detailLevel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,trip_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, interval_minutes: interval, detail_level: detailLevel });
}
