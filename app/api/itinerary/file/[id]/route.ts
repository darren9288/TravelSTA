export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";

// GET /api/itinerary/file/[id]
// Gated opener for private itinerary documents. Pure viewers (joined "Just
// viewing", no traveler identity) are refused — they can see the file name in
// the UI but never its contents. Travelers + admins/editors get redirected to
// a short-lived signed URL.
//
// Legacy/public files (is_private = false) just redirect to their public URL.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = serverDb();

  const { data: file } = await db
    .from("itinerary_files")
    .select("url, is_private, storage_path, item_id")
    .eq("id", params.id)
    .single();

  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  // Public/legacy file → straight to its URL, no gate.
  if (!file.is_private) {
    if (file.url) return NextResponse.redirect(file.url);
    return NextResponse.json({ error: "File has no URL" }, { status: 404 });
  }

  // Private file — resolve the trip and check the caller's access.
  const { data: item } = await db
    .from("itinerary_items")
    .select("trip_id")
    .eq("id", file.item_id)
    .single();
  const tripId = (item as { trip_id?: string } | null)?.trip_id;
  if (!tripId) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: member } = await db
    .from("trip_members")
    .select("role, traveler_id")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Not a member of this trip" }, { status: 403 });
  }

  // Allowed: admins/editors always, plus anyone with a traveler identity.
  // Blocked: pure viewers (role viewer + no traveler_id).
  const allowed =
    member.role === "admin" ||
    member.role === "editor" ||
    !!member.traveler_id;

  if (!allowed) {
    return NextResponse.json(
      { error: "Travelers only — viewers can't open trip documents." },
      { status: 403 }
    );
  }

  if (!file.storage_path) {
    return NextResponse.json({ error: "File path missing" }, { status: 500 });
  }

  // Mint a short-lived signed URL (2 min) on the private bucket and redirect.
  const { data: signed, error } = await db.storage
    .from("itinerary-docs")
    .createSignedUrl(file.storage_path, 120);

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not open file" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
