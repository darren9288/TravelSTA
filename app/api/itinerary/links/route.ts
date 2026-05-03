export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { item_id, label, url } = await req.json();
  if (!item_id || !url) return NextResponse.json({ error: "item_id and url required" }, { status: 400 });

  const { data, error } = await serverDb().from("itinerary_links")
    .insert({ item_id, label: label || null, url })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await serverDb().from("itinerary_links").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
