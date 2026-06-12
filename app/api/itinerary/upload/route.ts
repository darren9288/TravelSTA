export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor } from "@/lib/role";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const itemId = formData.get("item_id") as string | null;
  const tripId = formData.get("trip_id") as string | null;
  const type = formData.get("type") as string | null; // "photo" | "file"

  if (!file || !itemId || !tripId) {
    return NextResponse.json({ error: "file, item_id, trip_id required" }, { status: 400 });
  }

  const denied = await requireEditor(tripId);
  if (denied) return denied;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = safeName.split(".").pop()?.toLowerCase() ?? "bin";
  const isPhoto = type === "photo";

  // Cover photos → public 'itinerary-files' (rendered inline for everyone).
  // Document attachments → PRIVATE 'itinerary-docs'. Private docs are only
  // openable via a signed URL minted by /api/itinerary/file/[id] after a
  // traveler-identity check, so pure viewers can't read the contents.
  const bucket = isPhoto ? "itinerary-files" : "itinerary-docs";
  const path = isPhoto
    ? `${itemId}/photo.${ext}`
    : `${itemId}/${Date.now()}-${safeName}`;

  const { error } = await serverDb().storage
    .from(bucket)
    .upload(path, file, { upsert: isPhoto, contentType: file.type });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isPhoto) {
    const { data: { publicUrl } } = serverDb().storage
      .from(bucket)
      .getPublicUrl(path);
    return NextResponse.json({
      url: `${publicUrl}?t=${Date.now()}`,
      name: file.name,
      mime_type: file.type,
    });
  }

  // Private document — return the storage path (no public URL). The client
  // saves it via /api/itinerary/files; reads go through the gated endpoint.
  return NextResponse.json({
    storage_path: path,
    is_private: true,
    name: file.name,
    mime_type: file.type,
  });
}
