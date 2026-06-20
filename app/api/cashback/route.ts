export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor } from "@/lib/role";

// Manual cashback ledger. Each row is tied to an expense and credited to that
// expense's payer. Pure side-ledger — never touches splits or settlement.

export async function GET(req: NextRequest) {
  const trip_id = new URL(req.url).searchParams.get("trip_id");
  if (!trip_id) return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  const { data, error } = await serverDb()
    .from("cashbacks")
    .select("*, expense:expenses!expense_id(category, date, myr_amount), traveler:travelers!traveler_id(name, color)")
    .eq("trip_id", trip_id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cashbacks: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { trip_id, expense_id, traveler_id, amount, note } = await req.json();
  if (!trip_id || !expense_id || !traveler_id || amount == null) {
    return NextResponse.json({ error: "trip_id, expense_id, traveler_id and amount are required" }, { status: 400 });
  }
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
  }
  const denied = await requireEditor(trip_id); if (denied) return denied;

  const { data, error } = await serverDb()
    .from("cashbacks")
    .insert({
      trip_id,
      expense_id,
      traveler_id,
      amount: Math.round(amt * 100) / 100,
      note: note?.trim() || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { id, received, amount, note } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = serverDb();

  // Role check against the row's trip.
  const { data: existing } = await db.from("cashbacks").select("trip_id").eq("id", id).single();
  if (existing?.trip_id) { const denied = await requireEditor(existing.trip_id); if (denied) return denied; }

  const updates: Record<string, unknown> = {};
  if (received !== undefined) updates.received = !!received;
  if (amount !== undefined) {
    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    updates.amount = Math.round(amt * 100) / 100;
  }
  if (note !== undefined) updates.note = note?.trim() || null;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data, error } = await db.from("cashbacks").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const db = serverDb();

  // Revert switch: delete EVERY cashback for a trip. Safe — cashbacks are a
  // standalone side-table, so this never affects expenses/splits/settlement.
  const all = url.searchParams.get("all");
  const tripIdParam = url.searchParams.get("trip_id");
  if (all && tripIdParam) {
    const denied = await requireEditor(tripIdParam); if (denied) return denied;
    const { error } = await db.from("cashbacks").delete().eq("trip_id", tripIdParam);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const idParam = url.searchParams.get("id");
  const id = idParam ?? (await req.json().catch(() => ({}))).id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data: existing } = await db.from("cashbacks").select("trip_id").eq("id", id).single();
  if (existing?.trip_id) { const denied = await requireEditor(existing.trip_id); if (denied) return denied; }
  const { error } = await db.from("cashbacks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
