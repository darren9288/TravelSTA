export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const db = serverDb();
  const { data, error } = await db.from("trips").select("*").eq("id", params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const user = await getSessionUser();
  let my_traveler_id: string | null = null;
  let my_role: string | null = null;
  if (user) {
    const { data: member } = await db
      .from("trip_members")
      .select("traveler_id, role")
      .eq("trip_id", params.id)
      .eq("user_id", user.id)
      .single();
    my_traveler_id = member?.traveler_id ?? null;
    my_role = member?.role ?? null;
  }

  return NextResponse.json({ ...data, my_traveler_id, my_role });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { id, ...updates } = body;
  void id;
  const { data, error } = await serverDb().from("trips").update(updates).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const db = serverDb();

  // Delete trip background from storage
  const { data: bgFiles } = await db.storage.from("trip-backgrounds").list(params.id);
  if (bgFiles?.length) {
    await db.storage.from("trip-backgrounds").remove(bgFiles.map((f) => `${params.id}/${f.name}`));
  }

  // Delete itinerary files from storage (organized per item_id folder)
  const { data: items } = await db.from("itinerary_items").select("id").eq("trip_id", params.id);
  if (items?.length) {
    await Promise.all(
      items.map(async (item) => {
        const { data: files } = await db.storage.from("itinerary-files").list(item.id);
        if (files?.length) {
          await db.storage.from("itinerary-files").remove(files.map((f) => `${item.id}/${f.name}`));
        }
      })
    );
  }

  const { error } = await db.from("trips").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
