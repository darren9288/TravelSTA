export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

// GET /api/trips/[id]/export-data — backs up everything except expenses
// (those have their own export route). Useful for: cloning a trip's
// setup to a new trip, archiving a finished trip's structure, or just
// keeping a JSON snapshot in case of accidental deletion.
//
// Output is human-readable JSON, NOT designed to be re-imported directly
// (we don't have an inverse "/api/trips/import-setup" route yet) — it's
// a reference dump.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = serverDb();
  const tripId = params.id;

  const { data: trip, error: tripErr } = await db
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .single();
  if (tripErr) return NextResponse.json({ error: tripErr.message }, { status: 404 });

  const [
    { data: travelers },
    { data: wallets },
    { data: walletTopups },
    { data: poolTopups },
    { data: settlementPayments },
  ] = await Promise.all([
    db.from("travelers").select("*").eq("trip_id", tripId).order("created_at"),
    db.from("wallets").select("*").eq("trip_id", tripId).order("created_at"),
    db
      .from("wallet_topups")
      .select("*, wallet:wallets!wallet_id(name, traveler_id)")
      .eq("trip_id", tripId)
      .order("date"),
    db
      .from("pool_topups")
      .select("*, pool:travelers!pool_id(name), contributed_by:travelers!contributed_by_id(name)")
      .eq("trip_id", tripId)
      .order("date"),
    db
      .from("settlement_payments")
      .select("*, from:travelers!from_traveler_id(name), to:travelers!to_traveler_id(name)")
      .eq("trip_id", tripId)
      .order("created_at"),
  ]);

  const out = {
    _about: {
      exported_from_trip: trip?.name ?? null,
      destination: trip?.destination ?? null,
      dates: trip?.start_date && trip?.end_date ? `${trip.start_date} to ${trip.end_date}` : null,
      exported_at: new Date().toISOString(),
      note:
        "This is a backup dump of trip setup data. Expenses are exported separately via " +
        "/api/trips/[id]/export. Settlement payments include the resolved traveler names " +
        "so the export stays readable even if the source trip is deleted later.",
    },
    trip: {
      name: trip?.name,
      destination: trip?.destination,
      start_date: trip?.start_date,
      end_date: trip?.end_date,
      foreign_currency: trip?.foreign_currency,
      cash_rate: trip?.cash_rate,
      wise_rate: trip?.wise_rate,
      foreign_currency_2: trip?.foreign_currency_2,
      cash_rate_2: trip?.cash_rate_2,
      wise_rate_2: trip?.wise_rate_2,
      total_budget: trip?.total_budget,
      per_person_budget: trip?.per_person_budget,
    },
    travelers: (travelers ?? []).map((t: { name: string; color: string; is_pool: boolean; pool_currency: string | null; archived?: boolean }) => ({
      name: t.name,
      color: t.color,
      is_pool: t.is_pool,
      pool_currency: t.pool_currency,
      archived: t.archived ?? false,
    })),
    wallets: (wallets ?? []).map((w: { name: string; currency: string; traveler_id: string }) => ({
      name: w.name,
      currency: w.currency,
      traveler_id: w.traveler_id, // we keep the id for traceability; rename map can be done on import
    })),
    wallet_topups: (walletTopups ?? []).map((t: { amount: number; date: string; notes: string | null; wallet?: { name?: string } }) => ({
      wallet: t.wallet?.name,
      amount: t.amount,
      date: t.date,
      notes: t.notes,
    })),
    pool_topups: (poolTopups ?? []).map((t: { myr_amount: number; foreign_amount: number | null; date: string; notes: string | null; pool?: { name?: string }; contributed_by?: { name?: string } }) => ({
      pool: t.pool?.name,
      contributed_by: t.contributed_by?.name,
      myr_amount: t.myr_amount,
      foreign_amount: t.foreign_amount,
      date: t.date,
      notes: t.notes,
    })),
    settlement_payments: (settlementPayments ?? []).map((p: { amount: number; from_foreign_amount: number | null; to_foreign_amount: number | null; created_at: string; from?: { name?: string }; to?: { name?: string } }) => ({
      from: p.from?.name,
      to: p.to?.name,
      amount: p.amount,
      from_foreign_amount: p.from_foreign_amount,
      to_foreign_amount: p.to_foreign_amount,
      created_at: p.created_at,
    })),
  };

  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="trip-data-${trip?.name?.replace(/[^a-z0-9-]/gi, "_") ?? "trip"}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
