export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { item_id, name, url, mime_type, storage_path, is_private } = await req.json();
  // Private docs carry a storage_path (no public url); legacy/public files
  // carry a url. Require one of the two.
  if (!item_id || !name || (!url && !storage_path)) {
    return NextResponse.json({ error: "item_id, name, and url or storage_path required" }, { status: 400 });
  }

  const { data, error } = await serverDb().from("itinerary_files")
    .insert({
      item_id,
      name,
      url: url ?? null,
      mime_type: mime_type || null,
      storage_path: storage_path ?? null,
      is_private: !!is_private,
    })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const db = serverDb();
  // Best-effort: remove the underlying storage object for private docs so we
  // don't leave orphans in the bucket. (Public files were handled elsewhere.)
  const { data: file } = await db
    .from("itinerary_files")
    .select("storage_path, is_private")
    .eq("id", id)
    .single();
  if (file?.is_private && file.storage_path) {
    // Returns { error } rather than throwing; ignore failures (orphan is harmless).
    await db.storage.from("itinerary-docs").remove([file.storage_path]);
  }
  const { error } = await db.from("itinerary_files").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
