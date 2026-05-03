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

  const path = type === "photo"
    ? `${itemId}/photo.${ext}`
    : `${itemId}/${Date.now()}-${safeName}`;

  const { error } = await serverDb().storage
    .from("itinerary-files")
    .upload(path, file, { upsert: type === "photo", contentType: file.type });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = serverDb().storage
    .from("itinerary-files")
    .getPublicUrl(path);

  return NextResponse.json({
    url: type === "photo" ? `${publicUrl}?t=${Date.now()}` : publicUrl,
    name: file.name,
    mime_type: file.type,
  });
}
