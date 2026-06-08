export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { calculateSettlement } from "@/lib/settlement";
import type { Traveler, Expense } from "@/lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// GET /api/trips/[id]/statement-pdf?traveler_id=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// A shareable "what you owe and why" statement for one traveler:
//   - Summary: their share total (in the optional date range) + trip-wide net
//     balance (creditor / debtor).
//   - Settlement: the transfers involving them (trip-wide — a net balance
//     can't be meaningfully date-filtered).
//   - Itemised table: every expense they have a share in, within the range.
//
// from/to are optional and only filter the itemised table + its subtotal.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tripId = params.id;
  const p = new URL(req.url).searchParams;
  const travelerId = p.get("traveler_id");
  const from = p.get("from") || null;
  const to = p.get("to") || null;
  if (!travelerId) return NextResponse.json({ error: "traveler_id required" }, { status: 400 });

  const db = serverDb();
  const { data: trip, error: tripErr } = await db.from("trips").select("*").eq("id", tripId).single();
  if (tripErr || !trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const [{ data: travelers }, { data: expensesRaw }] = await Promise.all([
    db.from("travelers").select("*").eq("trip_id", tripId),
    db.from("expenses").select("*, paid_by:travelers!paid_by_id(name)").eq("trip_id", tripId).order("date"),
  ]);

  const expenseIds = (expensesRaw ?? []).map((e: { id: string }) => e.id);
  const { data: splits } = await db
    .from("expense_splits")
    .select("*")
    .in("expense_id", expenseIds.length ? expenseIds : ["__none__"]);

  // Attach splits so calculateSettlement + per-expense share lookup both work.
  const expenses = (expensesRaw ?? []).map((e: Expense) => ({
    ...e,
    splits: (splits ?? []).filter((s: { expense_id: string }) => s.expense_id === e.id),
  }));

  const person = (travelers ?? []).find((t: Traveler) => t.id === travelerId);
  if (!person) return NextResponse.json({ error: "Traveler not found" }, { status: 404 });

  // ── Trip-wide net balance + settlement instructions involving this person ──
  const { balances, instructions } = calculateSettlement(travelers as Traveler[], expenses as Expense[]);
  const myBalance = balances.find((b) => b.traveler.id === travelerId);
  const iOwe = instructions.filter((i) => i.from.id === travelerId); // I pay these
  const owedToMe = instructions.filter((i) => i.to.id === travelerId); // these pay me

  // ── Itemised shares (date-range filtered) ─────────────────────────────────
  type Row = { date: string; category: string; notes: string; payer: string; settled: string; share: number };
  const rows: Row[] = [];
  let rangeTotal = 0;
  for (const e of expenses as (Expense & { paid_by?: { name?: string } })[]) {
    if (from && e.date < from) continue;
    if (to && e.date > to) continue;
    const split = (e.splits ?? []).find((s) => s.traveler_id === travelerId);
    if (!split) continue;
    const share = Number(split.amount);
    if (share === 0) continue;
    rangeTotal += share;
    rows.push({
      date: e.date,
      category: e.category,
      notes: e.notes && e.notes.trim().toLowerCase() !== e.category.trim().toLowerCase() ? e.notes : "",
      payer: e.paid_by?.name ?? "?",
      settled: split.is_settled ? (split.locked ? "Locked" : "Settled") : "Unsettled",
      share,
    });
  }

  // ── Build PDF ──────────────────────────────────────────────────────────────
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text("Spending Statement", 14, 18);

  doc.setFontSize(13);
  doc.setTextColor(16, 185, 129);
  doc.text(person.name, 14, 27);

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(trip.name + (trip.destination ? ` · ${trip.destination}` : ""), 14, 34);
  const rangeLabel = from || to ? `Range: ${from ?? "start"} – ${to ?? "end"}` : "Range: whole trip";
  doc.text(rangeLabel, 14, 40);

  // Summary box
  const net = myBalance?.net ?? 0;
  const netLabel =
    net > 0.005 ? `Owed to ${person.name}: RM ${net.toFixed(2)} (creditor)` :
    net < -0.005 ? `${person.name} owes: RM ${Math.abs(net).toFixed(2)} (debtor)` :
    "All square — nothing outstanding";
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total share${from || to ? " (in range)" : ""}: RM ${rangeTotal.toFixed(2)}`, 14, 52);
  doc.setTextColor(net < -0.005 ? 220 : 15, net < -0.005 ? 38 : 23, net < -0.005 ? 38 : 42);
  doc.text(`Net position (whole trip): ${netLabel}`, 14, 58);

  // Settlement instructions involving them
  let cursorY = 66;
  if (iOwe.length || owedToMe.length) {
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text("Outstanding transfers", 14, cursorY + 4);
    const settleBody = [
      ...iOwe.map((i) => [`${person.name} → ${i.to.name}`, `RM ${i.amount.toFixed(2)}`, "you pay"]),
      ...owedToMe.map((i) => [`${i.from.name} → ${person.name}`, `RM ${i.amount.toFixed(2)}`, "you receive"]),
    ];
    autoTable(doc, {
      startY: cursorY + 8,
      head: [["Transfer", "Amount", "Direction"]],
      body: settleBody,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [217, 119, 6], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    cursorY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY + 20;
  }

  // Itemised shares
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`Expense shares (${rows.length})`, 14, cursorY + 10);
  autoTable(doc, {
    startY: cursorY + 14,
    head: [["Date", "Category", "Note", "Paid by", "Status", "Share"]],
    body: rows.map((r) => [
      r.date,
      r.category,
      r.notes.slice(0, 30),
      r.payer,
      r.settled,
      `RM ${r.share.toFixed(2)}`,
    ]),
    foot: [["", "", "", "", "Total", `RM ${rangeTotal.toFixed(2)}`]],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [16, 185, 129], textColor: 255 },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${person.name}'s statement · ${trip.name} · Generated by TravelSTA on ${new Date().toLocaleDateString("en-MY")} · Page ${i}/${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  const buffer = Buffer.from(doc.output("arraybuffer"));
  const safeTrip = String(trip.name).replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const safePerson = String(person.name).replace(/[^a-z0-9]/gi, "-").toLowerCase();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeTrip}-${safePerson}-statement.pdf"`,
    },
  });
}
