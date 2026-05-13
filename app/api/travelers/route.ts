export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor, tripIdFrom } from "@/lib/role";

export async function GET(req: NextRequest) {
  const tripId = new URL(req.url).searchParams.get("trip_id");
  let q = serverDb().from("travelers").select("*").order("created_at");
  if (tripId) q = q.eq("trip_id", tripId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const rows = Array.isArray(body) ? body : [body];
  const tripId = rows[0]?.trip_id;
  if (tripId) { const denied = await requireEditor(tripId); if (denied) return denied; }
  const { data, error } = await serverDb().from("travelers").insert(
    rows.map((r) => ({
      trip_id: r.trip_id,
      name: r.name,
      color: r.color ?? "#6366f1",
      is_pool: r.is_pool ?? false,
      pool_currency: r.pool_currency ?? null,
    }))
  ).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { id, name } = await req.json();
  const tripId = await tripIdFrom("travelers", id);
  if (tripId) { const denied = await requireEditor(tripId); if (denied) return denied; }
  const { data, error } = await serverDb().from("travelers").update({ name }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const tripId = await tripIdFrom("travelers", id);
  if (tripId) { const denied = await requireEditor(tripId); if (denied) return denied; }

  const db = serverDb();

  // Before delete: check for activity that would block the FK cascade. We do this
  // explicitly so the user gets a friendly message instead of a raw Postgres
  // "violates foreign key constraint" 500. expense_splits cascades on traveler
  // delete, so we don't check that — but expenses.paid_by_id, expenses.created_by_id,
  // pool_topups.pool_id and pool_topups.contributed_by_id all use NO ACTION.
  const [
    { count: expensesAsPayer },
    { count: expensesAsCreator },
    { count: poolTopupsAsPool },
    { count: poolTopupsAsContributor },
  ] = await Promise.all([
    db.from("expenses").select("id", { count: "exact", head: true }).eq("paid_by_id", id),
    db.from("expenses").select("id", { count: "exact", head: true }).eq("created_by_id", id),
    db.from("pool_topups").select("id", { count: "exact", head: true }).eq("pool_id", id),
    db.from("pool_topups").select("id", { count: "exact", head: true }).eq("contributed_by_id", id),
  ]);

  const blockers: string[] = [];
  if (expensesAsPayer && expensesAsPayer > 0) {
    blockers.push(`${expensesAsPayer} expense${expensesAsPayer === 1 ? "" : "s"} paid by them`);
  }
  if (poolTopupsAsPool && poolTopupsAsPool > 0) {
    blockers.push(`${poolTopupsAsPool} pool top-up${poolTopupsAsPool === 1 ? "" : "s"} contributed to this pool`);
  }
  if (poolTopupsAsContributor && poolTopupsAsContributor > 0) {
    blockers.push(`${poolTopupsAsContributor} pool top-up${poolTopupsAsContributor === 1 ? "" : "s"} they contributed`);
  }
  // expenses.created_by is informational only — block but mention separately.
  if (expensesAsCreator && expensesAsCreator > 0 && blockers.length === 0) {
    blockers.push(`${expensesAsCreator} expense${expensesAsCreator === 1 ? "" : "s"} they recorded`);
  }

  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error: `Can't delete — there's ${blockers.join(", ")}. Delete those first.`,
      },
      { status: 400 }
    );
  }

  const { error } = await db.from("travelers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
