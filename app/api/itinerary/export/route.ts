export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

// GET /api/itinerary/export?trip_id=X — returns a JSON file containing
// every itinerary item, its links and (file metadata only — actual
// uploaded files remain in Storage and need manual re-upload after
// import into another trip).
export async function GET(req: NextRequest) {
  const tripId = new URL(req.url).searchParams.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const db = serverDb();

  const { data: trip } = await db
    .from("trips")
    .select("name, start_date, end_date, destination")
    .eq("id", tripId)
    .single();

  const { data: items, error } = await db
    .from("itinerary_items")
    .select("*")
    .eq("trip_id", tripId)
    .order("date")
    .order("time", { nullsFirst: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const itemIds = (items ?? []).map((i: { id: string }) => i.id);
  const [{ data: links }, { data: files }] = await Promise.all([
    itemIds.length
      ? db.from("itinerary_links").select("*").in("item_id", itemIds)
      : Promise.resolve({ data: [] }),
    itemIds.length
      ? db.from("itinerary_files").select("*").in("item_id", itemIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Shape the export so the existing /api/itinerary/import endpoint can
  // round-trip it directly — we strip out internal IDs and just keep the
  // user-meaningful fields.
  const out = {
    _about: {
      exported_from_trip: trip?.name ?? null,
      destination: trip?.destination ?? null,
      dates: trip?.start_date && trip?.end_date ? `${trip.start_date} to ${trip.end_date}` : null,
      exported_at: new Date().toISOString(),
      note: "File attachments (PDFs/images) are not included — only their names. Re-upload them after import.",
    },
    items: (items ?? []).map((item: { id: string; date: string; time: string | null; end_time: string | null; title: string; category: string; notes: string | null; photo_url: string | null }) => ({
      date: item.date,
      time: item.time,
      end_time: item.end_time,
      title: item.title,
      category: item.category,
      notes: item.notes,
      photo_url: item.photo_url,
      links: (links ?? [])
        .filter((l: { item_id: string }) => l.item_id === item.id)
        .map((l: { label: string | null; url: string }) => ({ label: l.label, url: l.url })),
      file_names: (files ?? [])
        .filter((f: { item_id: string }) => f.item_id === item.id)
        .map((f: { name: string }) => f.name),
    })),
  };

  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="itinerary-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
