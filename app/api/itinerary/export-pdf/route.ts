export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Maps the internal category enum to a printable label + an accent colour
// for the header row of each day's table.
const CATEGORY_LABEL: Record<string, { label: string; rgb: [number, number, number] }> = {
  flight:    { label: "Flight",    rgb: [59, 130, 246] },
  hotel:     { label: "Hotel",     rgb: [168, 85, 247] },
  activity:  { label: "Activity",  rgb: [16, 185, 129] },
  food:      { label: "Food",      rgb: [249, 115, 22] },
  transport: { label: "Transport", rgb: [234, 179, 8] },
  other:     { label: "Other",     rgb: [148, 163, 184] },
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-MY", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtTimeRange(time: string | null, endTime: string | null) {
  if (!time && !endTime) return "";
  if (time && endTime) return `${time} – ${endTime}`;
  return time ?? endTime ?? "";
}

// GET /api/itinerary/export-pdf?trip_id=X — printable day-by-day plan.
// Groups items by date, shows time, title, category, notes, and any
// attached links. Suitable for printing or sharing in WhatsApp.
export async function GET(req: NextRequest) {
  const tripId = new URL(req.url).searchParams.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const db = serverDb();

  const { data: trip, error: tripError } = await db
    .from("trips")
    .select("name, destination, start_date, end_date")
    .eq("id", tripId)
    .single();
  if (tripError) return NextResponse.json({ error: tripError.message }, { status: 404 });

  const { data: items } = await db
    .from("itinerary_items")
    .select("*")
    .eq("trip_id", tripId)
    .order("date")
    .order("time", { nullsFirst: true });

  const itemIds = (items ?? []).map((i: { id: string }) => i.id);
  const [{ data: links }, { data: files }] = await Promise.all([
    itemIds.length
      ? db.from("itinerary_links").select("*").in("item_id", itemIds)
      : Promise.resolve({ data: [] }),
    itemIds.length
      ? db.from("itinerary_files").select("*").in("item_id", itemIds)
      : Promise.resolve({ data: [] }),
  ]);

  const linksByItem = new Map<string, { label: string | null; url: string }[]>();
  for (const l of links ?? []) {
    const list = linksByItem.get(l.item_id) ?? [];
    list.push({ label: l.label, url: l.url });
    linksByItem.set(l.item_id, list);
  }
  const filesByItem = new Map<string, { name: string }[]>();
  for (const f of files ?? []) {
    const list = filesByItem.get(f.item_id) ?? [];
    list.push({ name: f.name });
    filesByItem.set(f.item_id, list);
  }

  const doc = new jsPDF();

  // ── Header ──────────────────────────────────────────
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text("Trip Itinerary", 14, 18);

  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(trip.name, 14, 26);
  if (trip.destination) doc.text(`Destination: ${trip.destination}`, 14, 32);
  if (trip.start_date || trip.end_date) {
    doc.text(`Dates: ${trip.start_date ?? "?"} – ${trip.end_date ?? "?"}`, 14, 38);
  }

  if (!items || items.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(148, 163, 184);
    doc.text("No itinerary items yet.", 14, 56);
  } else {
    // Group items by date for day-by-day rendering.
    const byDate: Record<string, typeof items> = {};
    for (const item of items) {
      if (!byDate[item.date]) byDate[item.date] = [];
      byDate[item.date].push(item);
    }
    const dates = Object.keys(byDate).sort();

    let cursorY = 50;
    const pageHeight = doc.internal.pageSize.getHeight();

    for (const date of dates) {
      // Ensure we have room for at least the day header + one row, else break page.
      if (cursorY > pageHeight - 40) {
        doc.addPage();
        cursorY = 18;
      }

      // Day header
      doc.setFillColor(241, 245, 249);
      doc.rect(14, cursorY - 5, doc.internal.pageSize.getWidth() - 28, 8, "F");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(fmtDate(date), 16, cursorY);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`${byDate[date].length} item${byDate[date].length === 1 ? "" : "s"}`, doc.internal.pageSize.getWidth() - 16, cursorY, { align: "right" });
      cursorY += 6;

      // Items for this day, rendered as a table.
      const rows: string[][] = [];
      for (const it of byDate[date]) {
        const cat = CATEGORY_LABEL[it.category] ?? CATEGORY_LABEL.other;
        const linksForItem = linksByItem.get(it.id) ?? [];
        const filesForItem = filesByItem.get(it.id) ?? [];

        const notesBlock = [
          it.notes ?? "",
          linksForItem.length > 0
            ? linksForItem.map((l) => `🔗 ${l.label ?? l.url}`).join("\n")
            : "",
          filesForItem.length > 0
            ? `📎 ${filesForItem.map((f) => f.name).join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        rows.push([
          fmtTimeRange(it.time, it.end_time) || "—",
          cat.label,
          it.title,
          notesBlock,
        ]);
      }

      autoTable(doc, {
        startY: cursorY,
        head: [["Time", "Type", "Title", "Notes / Links / Files"]],
        body: rows,
        styles: { fontSize: 8, cellPadding: 2, valign: "top" },
        headStyles: { fillColor: [51, 65, 85], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 22 },
          2: { cellWidth: 52 },
          3: { cellWidth: "auto" },
        },
        margin: { left: 14, right: 14 },
      });

      cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 8;
    }
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Itinerary · Generated by TravelSTA on ${new Date().toLocaleDateString("en-MY")} · Page ${i}/${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  const buffer = Buffer.from(doc.output("arraybuffer"));
  const safeName = trip.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}-itinerary.pdf"`,
    },
  });
}
