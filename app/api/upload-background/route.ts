export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor } from "@/lib/role";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const tripId = formData.get("trip_id") as string | null;

  if (!file || !tripId) return NextResponse.json({ error: "file and trip_id required" }, { status: 400 });

  const denied = await requireEditor(tripId);
  if (denied) return denied;

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${tripId}/background.${ext}`;

  const { error } = await serverDb()
    .storage
    .from("trip-backgrounds")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = serverDb()
    .storage
    .from("trip-backgrounds")
    .getPublicUrl(path);

  // Bust the browser cache so the new image shows immediately
  const urlWithBust = `${publicUrl}?t=${Date.now()}`;
  return NextResponse.json({ url: urlWithBust });
}
