export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor } from "@/lib/role";

// Shape accepted from the client. We're deliberately permissive — only `date`
// and `title` are strictly required.
type ImportLink = { label?: string | null; url: string };
type ImportItem = {
  date: string;
  time?: string | null;
  end_time?: string | null;
  title: string;
  category?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  links?: ImportLink[];
};

type ValidationError = { row: number; field: string; message: string };

const VALID_CATEGORIES = ["flight", "hotel", "activity", "food", "transport", "other"];

// POST /api/itinerary/import — bulk-create itinerary items + links for one trip.
// Mirrors the pattern of /api/trips/[id]/import: validates everything first,
// returns 400 with row-level errors if anything fails, only inserts on success.
//
// Request body:
//   { trip_id: "<uuid>", data: <JSON object or string> }
// The data must be either:
//   - { items: [ImportItem, ...] }
//   - or a raw array of items
export async function POST(req: NextRequest) {
  const body = await req.json();
  const tripId: string | undefined = body.trip_id;
  if (!tripId) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const denied = await requireEditor(tripId);
  if (denied) return denied;

  // Accept either an already-parsed object or a raw JSON string from the file.
  let parsed: unknown;
  try {
    parsed = typeof body.data === "string" ? JSON.parse(body.data) : body.data;
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON file" }, { status: 400 });
  }

  let items: ImportItem[] = [];
  if (Array.isArray(parsed)) {
    items = parsed as ImportItem[];
  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items)) {
    items = (parsed as { items: ImportItem[] }).items;
  } else {
    return NextResponse.json(
      { error: "Expected { items: [...] } or a raw array at the top level." },
      { status: 400 }
    );
  }

  if (!items.length) {
    return NextResponse.json({ error: "No items found in file" }, { status: 400 });
  }

  const db = serverDb();

  // Build a duplicate-detection set on (date|title) so re-imports of the same
  // file don't double-fill the day list.
  const { data: existing } = await db
    .from("itinerary_items")
    .select("date, title")
    .eq("trip_id", tripId);
  const dupSet = new Set(
    (existing ?? []).map((e: { date: string; title: string }) =>
      `${e.date}|${e.title.toLowerCase().trim()}`
    )
  );

  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  const valid: ImportItem[] = [];

  items.forEach((item, idx) => {
    const row = idx + 1;

    if (!item.date) {
      errors.push({ row, field: "date", message: "Date is required (YYYY-MM-DD)" });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
      errors.push({ row, field: "date", message: `Date "${item.date}" must be YYYY-MM-DD` });
      return;
    }
    if (!item.title || !item.title.trim()) {
      errors.push({ row, field: "title", message: "Title is required" });
      return;
    }
    if (item.category && !VALID_CATEGORIES.includes(item.category)) {
      errors.push({
        row,
        field: "category",
        message: `Category "${item.category}" must be one of: ${VALID_CATEGORIES.join(", ")}`,
      });
      return;
    }
    if (item.time && !/^\d{1,2}:\d{2}$/.test(item.time)) {
      errors.push({ row, field: "time", message: `Time "${item.time}" must be HH:MM` });
      return;
    }
    if (item.end_time && !/^\d{1,2}:\d{2}$/.test(item.end_time)) {
      errors.push({ row, field: "end_time", message: `End time "${item.end_time}" must be HH:MM` });
      return;
    }

    const dupKey = `${item.date}|${item.title.toLowerCase().trim()}`;
    if (dupSet.has(dupKey)) {
      warnings.push(`Row ${row}: Duplicate item skipped (${item.title})`);
      return;
    }

    valid.push(item);
  });

  if (errors.length > 0) {
    return NextResponse.json(
      { success: false, errors, warnings, valid_count: valid.length, total_count: items.length },
      { status: 400 }
    );
  }

  // Insert items, then links. We do it sequentially per row so a single bad
  // link doesn't fail the whole batch — collect partial errors instead.
  let insertedCount = 0;
  const insertErrors: ValidationError[] = [];

  for (let i = 0; i < valid.length; i++) {
    const item = valid[i];
    const { data: created, error: insertErr } = await db
      .from("itinerary_items")
      .insert({
        trip_id: tripId,
        date: item.date,
        time: item.time || null,
        end_time: item.end_time || null,
        title: item.title.trim(),
        category: item.category || "activity",
        notes: item.notes ?? null,
        photo_url: item.photo_url ?? null,
      })
      .select()
      .single();

    if (insertErr || !created) {
      insertErrors.push({
        row: i + 1,
        field: "database",
        message: insertErr?.message ?? "Insert failed",
      });
      continue;
    }

    insertedCount++;

    // Insert links, if any.
    if (Array.isArray(item.links) && item.links.length) {
      const linkRows = item.links
        .filter((l) => l && typeof l.url === "string" && l.url.trim())
        .map((l) => ({
          item_id: created.id,
          label: l.label?.trim() || null,
          url: l.url.trim(),
        }));
      if (linkRows.length) {
        const { error: linkErr } = await db.from("itinerary_links").insert(linkRows);
        if (linkErr) {
          warnings.push(`Row ${i + 1}: links could not be saved — ${linkErr.message}`);
        }
      }
    }
  }

  return NextResponse.json({
    success: insertErrors.length === 0,
    inserted_count: insertedCount,
    total_count: items.length,
    warnings,
    errors: insertErrors.length > 0 ? insertErrors : undefined,
  });
}
