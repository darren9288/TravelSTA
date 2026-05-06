export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor } from "@/lib/role";

const ALLOWED_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "mp4", "webm", "mov"];

// POST { trip_id, filename } → returns { signedUrl, publicUrl }
// The client uploads the file directly to Supabase using signedUrl (PUT),
// then saves publicUrl to the trip. No large body passes through this server.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { trip_id, filename } = body as { trip_id?: string; filename?: string };

  if (!trip_id || !filename)
    return NextResponse.json({ error: "trip_id and filename required" }, { status: 400 });

  const denied = await requireEditor(trip_id);
  if (denied) return denied;

  const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
  if (!ALLOWED_EXTS.includes(ext))
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });

  const path = `${trip_id}/background.${ext}`;
  const db = serverDb();

  const { data, error } = await db.storage
    .from("trip-backgrounds")
    .createSignedUploadUrl(path, { upsert: true } as never);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = db.storage
    .from("trip-backgrounds")
    .getPublicUrl(path);

  return NextResponse.json({
    signedUrl: (data as { signedUrl: string }).signedUrl,
    publicUrl: `${publicUrl}?t=${Date.now()}`,
  });
}
