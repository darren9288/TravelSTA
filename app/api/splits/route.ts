export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor, tripIdForSplit } from "@/lib/role";
import { getSessionUser } from "@/lib/supabase-server";
import { sendPushToTripMembers } from "@/lib/push";
import { logActivity } from "@/lib/activity-log";

export async function PUT(req: NextRequest) {
  const { id, is_settled, from_wallet_id, to_wallet_id, lock } = await req.json();
  const tripId = await tripIdForSplit(id);
  if (tripId) { const denied = await requireEditor(tripId); if (denied) return denied; }

  const db = serverDb();

  // Guard read — only columns that ALWAYS exist (is_settled, locked). We
  // deliberately do NOT select lock_source here: if migration 025 hasn't been
  // run yet, selecting a missing column would error and break even normal
  // settle-toggling. lock_source is read separately, only in the lock path.
  const { data: current } = await db
    .from("expense_splits")
    .select("is_settled, locked")
    .eq("id", id)
    .single();

  // ── Explicit lock / unlock request ─────────────────────────────────────
  // Body { lock: true }  → manually lock a SETTLED split (freeze it).
  // Body { lock: false } → unlock, but ONLY if it was a MANUAL lock. Settle-All
  //   locks ('settle_all') are tied to settlement_payments and must be managed
  //   from the Settlement page — unlocking here would desync the math.
  if (typeof lock === "boolean") {
    // lock_source is required for this path — read it now and surface a clear
    // message if the migration is missing (instead of a misleading error).
    const { data: lockRow, error: lockReadErr } = await db
      .from("expense_splits")
      .select("is_settled, locked, lock_source")
      .eq("id", id)
      .single();
    if (lockReadErr) {
      const missingCol = /lock_source/i.test(lockReadErr.message);
      return NextResponse.json(
        {
          error: missingCol
            ? "Lock feature needs a one-time DB migration. Run supabase/migrations/025_split_lock_source.sql in Supabase, then try again."
            : lockReadErr.message,
        },
        { status: missingCol ? 503 : 500 }
      );
    }
    if (lock) {
      if (!lockRow?.is_settled) {
        return NextResponse.json({ error: "Only a settled split can be locked." }, { status: 400 });
      }
      const { data, error } = await db
        .from("expense_splits")
        .update({ locked: true, lock_source: "manual" })
        .eq("id", id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      void logActivity({ action: "split_toggle", userId: (await getSessionUser())?.id ?? null, tripId, details: { split_id: id, locked: true, lock_source: "manual" }, req });
      return NextResponse.json(data);
    } else {
      if (lockRow?.lock_source !== "manual") {
        return NextResponse.json(
          { error: "Only manually-locked splits can be unlocked here. Settle-All locks are managed from the Settlement page." },
          { status: 409 }
        );
      }
      const { data, error } = await db
        .from("expense_splits")
        .update({ locked: false, lock_source: null })
        .eq("id", id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      void logActivity({ action: "split_toggle", userId: (await getSessionUser())?.id ?? null, tripId, details: { split_id: id, locked: false }, req });
      return NextResponse.json(data);
    }
  }

  // ── Normal settle toggle ───────────────────────────────────────────────
  // Guard: a locked split can't be toggled. This protects against a stale
  // page (service-worker cache) still showing the checkbox as interactive
  // after a Settle All / manual lock happened elsewhere — the server is the
  // source of truth, so even a stale tap can't corrupt the data.
  if (current?.locked) {
    return NextResponse.json(
      { error: "This split is locked and can't be changed. Refresh to see the latest state." },
      { status: 409 }
    );
  }

  let fromW: string | null = from_wallet_id ?? null;
  let toW: string | null = to_wallet_id ?? null;

  // Pool guard: never attach wallet ids when this split belongs to a
  // pool-paid expense. The member already funded the pool, so charging their
  // wallet again for a pool-paid expense would double-debit them.
  if (is_settled && (fromW || toW)) {
    const { data: splitRow } = await db
      .from("expense_splits")
      .select("amount, expense_id")
      .eq("id", id)
      .single();
    if (splitRow?.expense_id) {
      const { data: exp } = await db
        .from("expenses")
        .select("paid_by_id")
        .eq("id", splitRow.expense_id)
        .single();
      if (exp?.paid_by_id) {
        const { data: payer } = await db
          .from("travelers")
          .select("is_pool")
          .eq("id", exp.paid_by_id)
          .single();
        if ((payer as { is_pool?: boolean } | null)?.is_pool) {
          fromW = null;
          toW = null;
        }
      }
    }
  }

  const update: Record<string, unknown> = { is_settled };
  if (is_settled) {
    update.from_wallet_id = fromW;
    update.to_wallet_id = toW;
  } else {
    // Unsettling — clear wallet links
    update.from_wallet_id = null;
    update.to_wallet_id = null;
  }
  const { data, error } = await db
    .from("expense_splits")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Freeze the foreign-currency equivalent at settle time so a later rate
  // change can't retroactively rewrite this settle's JPY in wallet history.
  // Best-effort + isolated: if migration 027 hasn't run yet the columns are
  // missing and this silently no-ops (settling itself already succeeded above).
  try {
    if (is_settled && (fromW || toW)) {
      const amtMyr = Number((data as { amount?: number } | null)?.amount ?? 0);
      const wids = [fromW, toW].filter(Boolean) as string[];
      const [{ data: ws }, { data: trip }] = await Promise.all([
        db.from("wallets").select("id, currency, name").in("id", wids),
        db.from("trips").select("cash_rate, wise_rate, foreign_currency_2, cash_rate_2, wise_rate_2").eq("id", tripId ?? "").single(),
      ]);
      const freeze = (wid: string | null): number | null => {
        if (!wid) return null;
        const w = (ws ?? []).find((x: { id: string }) => x.id === wid) as { currency?: string; name?: string } | undefined;
        if (!w || w.currency === "MYR") return null;
        const isWise = (w.name ?? "").toLowerCase().includes("wise");
        const t = trip as { cash_rate?: number; wise_rate?: number; foreign_currency_2?: string | null; cash_rate_2?: number; wise_rate_2?: number } | null;
        const rate = (t?.foreign_currency_2 && w.currency === t.foreign_currency_2)
          ? (isWise ? t?.wise_rate_2 : t?.cash_rate_2)
          : (isWise ? t?.wise_rate : t?.cash_rate);
        return parseFloat((amtMyr * Number(rate ?? 1)).toFixed(2));
      };
      await db
        .from("expense_splits")
        .update({ from_foreign_amount: freeze(fromW), to_foreign_amount: freeze(toW) })
        .eq("id", id);
    } else if (!is_settled) {
      // Clear frozen values on un-settle too (best-effort).
      await db.from("expense_splits").update({ from_foreign_amount: null, to_foreign_amount: null }).eq("id", id);
    }
  } catch {
    // columns may not exist yet (migration 027) — settling already succeeded.
  }

  {
    const meUser = await getSessionUser();
    void logActivity({
      action: "split_toggle",
      userId: meUser?.id ?? null,
      tripId,
      details: { split_id: id, is_settled },
      req,
    });
  }

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
