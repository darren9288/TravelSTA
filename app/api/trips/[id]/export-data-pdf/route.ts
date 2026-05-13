export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// GET /api/trips/[id]/export-data-pdf — visual backup of the trip setup
// (travelers, pools, wallets, wallet top-ups, pool top-ups, settlement
// history). Counterpart to the JSON export-data route, but human-readable
// for normal users who don't want to deal with raw JSON.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = serverDb();
  const tripId = params.id;

  const { data: trip, error: tripError } = await db
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .single();
  if (tripError) return NextResponse.json({ error: tripError.message }, { status: 404 });

  const [
    { data: travelers },
    { data: wallets },
    { data: walletTopups },
    { data: poolTopups },
    { data: settlementPayments },
  ] = await Promise.all([
    db.from("travelers").select("*").eq("trip_id", tripId).order("created_at"),
    db
      .from("wallets")
      .select("*, traveler:travelers!traveler_id(name)")
      .eq("trip_id", tripId)
      .order("created_at"),
    db
      .from("wallet_topups")
      .select("*, wallet:wallets!wallet_id(name, traveler:travelers!traveler_id(name))")
      .eq("trip_id", tripId)
      .order("date"),
    db
      .from("pool_topups")
      .select(
        "*, pool:travelers!pool_id(name), contributed_by:travelers!contributed_by_id(name)"
      )
      .eq("trip_id", tripId)
      .order("date"),
    db
      .from("settlement_payments")
      .select(
        "*, from_traveler:travelers!from_traveler_id(name), to_traveler:travelers!to_traveler_id(name)"
      )
      .eq("trip_id", tripId)
      .order("created_at"),
  ]);

  const doc = new jsPDF();

  // ── Header ────────────────────────────────────────────
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text("Trip Data Backup", 14, 18);

  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(trip.name, 14, 26);
  if (trip.destination) doc.text(`Destination: ${trip.destination}`, 14, 32);
  if (trip.start_date || trip.end_date) {
    doc.text(`Dates: ${trip.start_date ?? "?"} – ${trip.end_date ?? "?"}`, 14, 38);
  }
  doc.text(
    `Currency: MYR base · ${trip.foreign_currency ?? "—"} (cash ${trip.cash_rate}, wise ${trip.wise_rate})` +
      (trip.foreign_currency_2 ? ` · ${trip.foreign_currency_2} (cash ${trip.cash_rate_2}, wise ${trip.wise_rate_2})` : ""),
    14,
    44
  );

  // ── Travelers + Pools ────────────────────────────────
  const realTravelers = (travelers ?? []).filter((t: { is_pool: boolean }) => !t.is_pool);
  const pools = (travelers ?? []).filter((t: { is_pool: boolean }) => t.is_pool);

  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text("Travelers", 14, 58);
  autoTable(doc, {
    startY: 62,
    head: [["Name", "Status"]],
    body: realTravelers.map((t: { name: string; archived?: boolean }) => [
      t.name,
      t.archived ? "Archived" : "Active",
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [16, 185, 129], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  if (pools.length > 0) {
    const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 80;
    doc.setFontSize(13);
    doc.text("Pools", 14, y + 10);
    autoTable(doc, {
      startY: y + 14,
      head: [["Pool", "Currency", "Status"]],
      body: pools.map((p: { name: string; pool_currency: string | null; archived?: boolean }) => [
        p.name,
        p.pool_currency ?? "MYR",
        p.archived ? "Archived" : "Active",
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  }

  // ── Wallets ───────────────────────────────────────────
  if ((wallets ?? []).length > 0) {
    const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 90;
    doc.setFontSize(13);
    doc.text("Wallets", 14, y + 10);
    autoTable(doc, {
      startY: y + 14,
      head: [["Owner", "Wallet Name", "Currency"]],
      body: (wallets ?? []).map((w: { name: string; currency: string; traveler?: { name: string } }) => [
        w.traveler?.name ?? "?",
        w.name,
        w.currency,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [99, 102, 241], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  }

  // ── Wallet Top-ups ────────────────────────────────────
  if ((walletTopups ?? []).length > 0) {
    doc.addPage();
    doc.setFontSize(13);
    doc.text("Wallet Top-ups", 14, 18);
    autoTable(doc, {
      startY: 22,
      head: [["Date", "Owner", "Wallet", "Amount", "Notes"]],
      body: (walletTopups ?? []).map(
        (t: {
          date: string;
          amount: number;
          notes: string | null;
          wallet?: { name?: string; traveler?: { name?: string } };
        }) => [
          t.date,
          t.wallet?.traveler?.name ?? "?",
          t.wallet?.name ?? "?",
          Number(t.amount).toFixed(2),
          t.notes ?? "",
        ]
      ),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [99, 102, 241], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  }

  // ── Pool Top-ups ──────────────────────────────────────
  if ((poolTopups ?? []).length > 0) {
    const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60;
    doc.setFontSize(13);
    doc.text("Pool Top-ups", 14, y + 10);
    autoTable(doc, {
      startY: y + 14,
      head: [["Date", "Pool", "Contributor", "MYR", "Foreign", "Notes"]],
      body: (poolTopups ?? []).map(
        (t: {
          date: string;
          myr_amount: number;
          foreign_amount: number | null;
          notes: string | null;
          pool?: { name?: string };
          contributed_by?: { name?: string };
        }) => [
          t.date,
          t.pool?.name ?? "?",
          t.contributed_by?.name ?? "?",
          `RM ${Number(t.myr_amount).toFixed(2)}`,
          t.foreign_amount != null ? Number(t.foreign_amount).toLocaleString() : "",
          t.notes ?? "",
        ]
      ),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  }

  // ── Settlement History ───────────────────────────────
  if ((settlementPayments ?? []).length > 0) {
    const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
    doc.setFontSize(13);
    doc.text("Settlement History", 14, y + 10);
    autoTable(doc, {
      startY: y + 14,
      head: [["Date", "From", "To", "MYR", "From Foreign", "To Foreign"]],
      body: (settlementPayments ?? []).map(
        (p: {
          created_at: string;
          amount: number;
          from_foreign_amount: number | null;
          to_foreign_amount: number | null;
          from_traveler?: { name?: string };
          to_traveler?: { name?: string };
        }) => [
          new Date(p.created_at).toLocaleDateString("en-MY"),
          p.from_traveler?.name ?? "?",
          p.to_traveler?.name ?? "?",
          `RM ${Number(p.amount).toFixed(2)}`,
          p.from_foreign_amount != null ? Number(p.from_foreign_amount).toLocaleString() : "",
          p.to_foreign_amount != null ? Number(p.to_foreign_amount).toLocaleString() : "",
        ]
      ),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [217, 119, 6], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Trip data backup · Generated by TravelSTA on ${new Date().toLocaleDateString("en-MY")} · Page ${i}/${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  const buffer = Buffer.from(doc.output("arraybuffer"));
  const safeName = trip.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}-trip-data.pdf"`,
    },
  });
}
