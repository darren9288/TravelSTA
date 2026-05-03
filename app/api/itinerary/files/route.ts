export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { item_id, name, url, mime_type } = await req.json();
  if (!item_id || !name || !url) return NextResponse.json({ error: "item_id, name, url required" }, { status: 400 });

  const { data, error } = await serverDb().from("itinerary_files")
    .insert({ item_id, name, url, mime_type: mime_type || null })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await serverDb().from("itinerary_files").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
