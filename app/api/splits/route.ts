export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor, tripIdForSplit } from "@/lib/role";
import { getSessionUser } from "@/lib/supabase-server";
import { sendPushToTripMembers } from "@/lib/push";

export async function PUT(req: NextRequest) {
  const { id, is_settled, from_wallet_id, to_wallet_id } = await req.json();
  const tripId = await tripIdForSplit(id);
  if (tripId) { const denied = await requireEditor(tripId); if (denied) return denied; }
  const update: Record<string, unknown> = { is_settled };
  if (is_settled) {
    update.from_wallet_id = from_wallet_id ?? null;
    update.to_wallet_id = to_wallet_id ?? null;
  } else {
    // Unsettling — clear wallet links
    update.from_wallet_id = null;
    update.to_wallet_id = null;
  }
  const { data, error } = await serverDb()
    .from("expense_splits")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Push: "{traveler}'s split marked settled/unsettled"
  if (tripId) {
    try {
      const me = await getSessionUser();
      const db = serverDb();
      // Look up who this split belongs to + expense info
      const { data: split } = await db
        .from("expense_splits")
        .select("traveler_id, amount, expense_id")
        .eq("id", id)
        .single();
      if (split) {
        const [{ data: traveler }, { data: expense }, { data: trip }] = await Promise.all([
          db.from("travelers").select("name").eq("id", split.traveler_id).single(),
          db.from("expenses").select("category, notes").eq("id", split.expense_id).single(),
          db.from("trips").select("name").eq("id", tripId).single(),
        ]);
        const name = traveler?.name ?? "Someone";
        const tripName = trip?.name ?? "your trip";
        const amt = Number(split.amount ?? 0).toFixed(0);
        const cat = expense?.category ?? "";
        const status = is_settled ? "settled ✓" : "unsettled";
        void sendPushToTripMembers(
          tripId,
          {
            title: `Split ${status} — ${tripName}`,
            body: `${name}'s RM ${amt} share (${cat}) was marked ${status}`,
            url: `/trips/${tripId}/expenses`,
            tag: `split-${id}`,
          },
          me?.id,
          { category: "split_toggle" }
        ).catch((e: unknown) => console.error("[push.split-toggle]", (e as Error).message));
      }
    } catch (e) {
      console.error("[push.split-toggle] setup failed:", (e as Error).message);
    }
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { trip_id, traveler_id, from_wallet_id, to_wallet_id } = await req.json();
  if (!trip_id || !traveler_id) return NextResponse.json({ error: "trip_id and traveler_id required" }, { status: 400 });
  const denied = await requireEditor(trip_id); if (denied) return denied;

  const supabase = serverDb();
  const { data: expenses } = await supabase.from("expenses").select("id").eq("trip_id", trip_id);
  const expenseIds = (expenses ?? []).map((e: { id: string }) => e.id);
  if (!expenseIds.length) return NextResponse.json({ updated: 0 });

  const update: Record<string, unknown> = {
    is_settled: true,
    from_wallet_id: from_wallet_id ?? null,
    to_wallet_id: to_wallet_id ?? null,
  };

  const { error } = await supabase
    .from("expense_splits")
    .update(update)
    .in("expense_id", expenseIds)
    .eq("traveler_id", traveler_id)
    .eq("is_settled", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
