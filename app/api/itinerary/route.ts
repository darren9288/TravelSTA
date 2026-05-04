export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor } from "@/lib/role";

export async function GET(req: NextRequest) {
  const tripId = new URL(req.url).searchParams.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const db = serverDb();
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

  const result = (items ?? []).map((item: { id: string }) => ({
    ...item,
    links: (links ?? []).filter((l: { item_id: string }) => l.item_id === item.id),
    files: (files ?? []).filter((f: { item_id: string }) => f.item_id === item.id),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const denied = await requireEditor(body.trip_id);
  if (denied) return denied;

  const { data, error } = await serverDb().from("itinerary_items").insert({
    trip_id: body.trip_id,
    date: body.date,
    time: body.time || null,
    end_time: body.end_time || null,
    title: body.title,
    category: body.category ?? "activity",
    notes: body.notes ?? null,
    photo_url: body.photo_url ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, links: [], files: [] }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const denied = await requireEditor(body.trip_id);
  if (denied) return denied;

  const { data, error } = await serverDb().from("itinerary_items")
    .update({
      date: body.date,
      time: body.time || null,
      end_time: body.end_time || null,
      title: body.title,
      category: body.category,
      notes: body.notes ?? null,
      photo_url: body.photo_url ?? null,
    })
    .eq("id", body.id)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { id, trip_id } = await req.json();
  const denied = await requireEditor(trip_id);
  if (denied) return denied;

  const { error } = await serverDb().from("itinerary_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
