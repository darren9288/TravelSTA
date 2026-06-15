export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor } from "@/lib/role";
import { getSessionUser } from "@/lib/supabase-server";
import { sendPushToTripMembers } from "@/lib/push";
import { detectExpenseAnomalies, detectPoolOverdraft } from "@/lib/anomalies";
import type { Trip } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function lastDay(month: string) {
  return new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)), 0).getDate();
}

export async function GET(req: NextRequest) {
  const supabase = serverDb();
  const p = new URL(req.url).searchParams;
  const tripId = p.get("trip_id");
  const month = p.get("month");
  const category = p.get("category");

  let q = supabase
    .from("expenses")
    .select("*, paid_by:travelers!paid_by_id(*)")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (tripId) q = q.eq("trip_id", tripId);
  if (month) q = q.gte("date", `${month}-01`).lte("date", `${month}-${lastDay(month)}`);
  if (category) q = q.eq("category", category);
  const limit = p.get("limit");
  if (limit) q = q.limit(parseInt(limit));

  const { data: expenses, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!expenses?.length) return NextResponse.json([]);

  const expenseIds = expenses.map((e) => e.id);
  const { data: splits, error: splitError } = await supabase
    .from("expense_splits")
    .select("*")
    .in("expense_id", expenseIds);

  if (splitError) return NextResponse.json({ error: splitError.message }, { status: 500 });

  const result = expenses.map((e) => ({
    ...e,
    splits: (splits ?? []).filter((s) => s.expense_id === e.id),
  }));

  return NextResponse.json(result);
}

// Server-side guard: split amounts must sum to the expense total (within the
// JPY-rounding tolerance). Protects the settlement math from a malformed/
// tampered/offline-replayed body that bypasses the client-side check.
function validateSplitsSum(splits: { amount: number }[] | undefined, myrAmount: number): string | null {
  if (!splits?.length) return null;
  const sum = splits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  if (Math.abs(sum - Number(myrAmount)) > 0.05) {
    return `Splits total RM ${sum.toFixed(2)} must equal the expense total RM ${Number(myrAmount).toFixed(2)}.`;
  }
  return null;
}

// Round a split amount to 2dp so sub-cent values can never persist (they cause
// 1-cent drift in the greedy settlement transfers).
function round2(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

export async function POST(req: NextRequest) {
  const supabase = serverDb();
  const body = await req.json();
  const denied = await requireEditor(body.trip_id);
  if (denied) return denied;

  // Validate BEFORE inserting the expense so a bad payload can't leave an
  // orphaned expense with mismatched splits.
  const sumErr = validateSplitsSum(body.splits, body.myr_amount);
  if (sumErr) return NextResponse.json({ error: sumErr }, { status: 400 });

  const { data: expense, error: expErr } = await supabase.from("expenses").insert({
    trip_id: body.trip_id,
    date: body.date,
    category: body.category,
    split_type: body.split_type,
    paid_by_id: body.paid_by_id,
    payment_type: body.payment_type,
    currency: body.currency ?? "MYR",
    foreign_amount: body.foreign_amount ?? null,
    myr_amount: body.myr_amount,
    notes: body.notes ?? null,
    created_by_id: body.created_by_id ?? null,
    wallet_id: body.wallet_id ?? null,
  }).select().single();

  if (expErr) return NextResponse.json({ error: expErr.message }, { status: 500 });

  // Audit log for super-admin review.
  {
    const me = await getSessionUser();
    void logActivity({
      action: "expense_add",
      userId: me?.id ?? null,
      tripId: body.trip_id,
      details: {
        expense_id: expense.id,
        category: body.category,
        myr_amount: body.myr_amount,
        paid_by_id: body.paid_by_id,
      },
      req,
    });
  }

  if (body.splits?.length) {
    const { error: splitErr } = await supabase.from("expense_splits").insert(
      body.splits.map((s: { traveler_id: string; amount: number }) => ({
        expense_id: expense.id,
        traveler_id: s.traveler_id,
        amount: round2(s.amount),
        is_settled: false,
      }))
    );
    if (splitErr) return NextResponse.json({ error: splitErr.message }, { status: 500 });
  }

  // Push: "{payer} added an expense — RM {amount} · {category}"
  try {
    const me = await getSessionUser();
    const [{ data: payer }, { data: trip }] = await Promise.all([
      supabase.from("travelers").select("name").eq("id", body.paid_by_id).single(),
      supabase.from("trips").select("name, foreign_currency").eq("id", body.trip_id).single(),
    ]);
    const payerName = payer?.name ?? "Someone";
    const tripName = trip?.name ?? "your trip";
    const myr = Number(body.myr_amount ?? 0).toFixed(0);
    const fc = trip?.foreign_currency;
    const foreignAmt = body.foreign_amount ? ` (${trip?.foreign_currency ?? ""}${Math.round(body.foreign_amount)})` : "";
    const desc = body.notes ? ` — ${String(body.notes).slice(0, 40)}` : "";
    void sendPushToTripMembers(
      body.trip_id,
      {
        title: `${payerName} added an expense`,
        body: `RM ${myr}${foreignAmt} · ${body.category}${desc}`,
        url: `/trips/${body.trip_id}/expenses`,
        tag: `expense-${expense.id}`,
      },
      me?.id,
      { category: "expense_add" }
    ).catch((e: unknown) => console.error("[push.expense]", (e as Error).message));
    void fc;
  } catch (e) {
    console.error("[push.expense] setup failed:", (e as Error).message);
  }

  // Anomaly detection: run all 9 detectors and fire one push per anomaly.
  // Wrapped so detector failures never break the create flow.
  try {
    const { data: tripFull } = await supabase
      .from("trips")
      .select("*")
      .eq("id", body.trip_id)
      .single();
    if (tripFull) {
      const anomalies = await detectExpenseAnomalies(expense, tripFull as Trip);
      // Pool overdraft is trip-scoped, not expense-scoped — only check when
      // the expense is paid by a pool (likely changes the balance).
      const { data: payerInfo } = await supabase
        .from("travelers")
        .select("is_pool")
        .eq("id", body.paid_by_id)
        .single();
      if ((payerInfo as { is_pool?: boolean } | null)?.is_pool) {
        const overdrafts = await detectPoolOverdraft(body.trip_id, (tripFull as Trip).name);
        anomalies.push(...overdrafts);
      }
      for (const a of anomalies) {
        void sendPushToTripMembers(
          body.trip_id,
          { title: a.title, body: a.body, url: a.url, tag: a.tag },
          undefined, // Anomalies notify EVERYONE including the triggerer — they need to fix it
          { category: "anomaly", isAnomaly: true }
        ).catch((e: unknown) => console.error(`[push.anomaly.${a.type}]`, (e as Error).message));
      }
    }
  } catch (e) {
    console.error("[push.anomaly] setup failed:", (e as Error).message);
  }

  return NextResponse.json(expense, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const supabase = serverDb();
  const body = await req.json();
  const { id, splits, ...updates } = body;
  if (body.trip_id) { const denied = await requireEditor(body.trip_id); if (denied) return denied; }

  // Validate split sum against the (possibly updated) total before touching anything.
  if (splits && body.myr_amount != null) {
    const sumErr = validateSplitsSum(splits, body.myr_amount);
    if (sumErr) return NextResponse.json({ error: sumErr }, { status: 400 });
  }

  const { data, error } = await supabase.from("expenses").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  {
    const me = await getSessionUser();
    void logActivity({
      action: "expense_edit",
      userId: me?.id ?? null,
      tripId: data?.trip_id ?? null,
      details: { expense_id: id, fields: Object.keys(updates) },
      req,
    });
  }

  if (splits) {
    // Preserve settled/locked state across the delete+reinsert. Previously this
    // blindly reset every split to is_settled=false, which silently RE-OPENED
    // already-settled debts (and dropped locked/lock_source/wallet ids) whenever
    // anyone edited an expense — even just its note — desyncing the settlement.
    //
    // Defensive about optional columns: lock_source (025) and the frozen
    // foreign amounts (027) may be absent on an un-migrated DB. We read + write
    // them via a "rich → minimal" fallback so a missing column can never cause
    // a delete-then-failed-insert (which would permanently lose all splits).
    type PrevSplit = {
      traveler_id: string; amount: number; is_settled: boolean;
      locked?: boolean | null; lock_source?: string | null;
      from_wallet_id?: string | null; to_wallet_id?: string | null;
      from_foreign_amount?: number | null; to_foreign_amount?: number | null;
    };
    let existingSplits = (await supabase
      .from("expense_splits")
      .select("traveler_id, amount, is_settled, locked, lock_source, from_wallet_id, to_wallet_id, from_foreign_amount, to_foreign_amount")
      .eq("expense_id", id)).data as PrevSplit[] | null;
    if (!existingSplits) {
      // Optional column(s) missing — fall back to always-present columns.
      existingSplits = (await supabase
        .from("expense_splits")
        .select("traveler_id, amount, is_settled, from_wallet_id, to_wallet_id")
        .eq("expense_id", id)).data as PrevSplit[] | null;
    }
    const prevByTraveler = new Map((existingSplits ?? []).map((s) => [s.traveler_id, s]));

    // Guard: refuse to change a split that was locked by Settle All. Editing it
    // would desync the recorded settlement_payments. (Note-only edits keep the
    // same amount and are allowed — they're preserved unchanged below.)
    const incomingByTraveler = new Map(
      (splits as { traveler_id: string; amount: number }[]).map((s) => [s.traveler_id, s])
    );
    const wouldBreakSettleAll = (existingSplits ?? []).some((s) => {
      if (!(s.locked && s.lock_source === "settle_all")) return false;
      const inc = incomingByTraveler.get(s.traveler_id);
      return !inc || Math.abs(Number(inc.amount) - Number(s.amount)) >= 0.005;
    });
    if (wouldBreakSettleAll) {
      return NextResponse.json(
        { error: "This expense is part of a completed Settle All. Editing its split amounts would break the settlement — un-settle it from the Settlement page first." },
        { status: 409 }
      );
    }

    // Build a row, optionally including the columns that may not exist yet.
    function buildRow(s: { traveler_id: string; amount: number }, withOptional: boolean): Record<string, unknown> {
      const prev = prevByTraveler.get(s.traveler_id);
      const unchanged = prev && Math.abs(Number(prev.amount) - Number(s.amount)) < 0.005;
      const row: Record<string, unknown> = {
        expense_id: id,
        traveler_id: s.traveler_id,
        amount: round2(s.amount),
        is_settled: prev && unchanged ? prev.is_settled : false,
      };
      if (prev && unchanged) {
        // Carry over wallet links (always-present columns since migration 005).
        row.from_wallet_id = prev.from_wallet_id ?? null;
        row.to_wallet_id = prev.to_wallet_id ?? null;
        if (withOptional) {
          // Optional columns (025 / 027) — only included in the rich attempt.
          row.locked = prev.locked ?? false;
          row.lock_source = prev.lock_source ?? null;
          row.from_foreign_amount = prev.from_foreign_amount ?? null;
          row.to_foreign_amount = prev.to_foreign_amount ?? null;
        }
      }
      return row;
    }

    await supabase.from("expense_splits").delete().eq("expense_id", id);
    // Try the rich insert (preserves locked/lock_source/frozen amounts). If a
    // column is missing, retry with only always-present columns so the splits
    // are never left deleted-without-reinsert.
    let insErr = (await supabase.from("expense_splits").insert(
      (splits as { traveler_id: string; amount: number }[]).map((s) => buildRow(s, true))
    )).error;
    if (insErr) {
      insErr = (await supabase.from("expense_splits").insert(
        (splits as { traveler_id: string; amount: number }[]).map((s) => buildRow(s, false))
      )).error;
    }
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Re-run anomaly detection on edit — covers cases like fixing splits or
  // changing the amount/category. Only push for the high-signal ones (skip
  // duplicate + unbalanced — those would re-fire annoyingly on every edit).
  if (data?.trip_id) {
    try {
      const { data: tripFull } = await supabase.from("trips").select("*").eq("id", data.trip_id).single();
      if (tripFull) {
        const anomalies = await detectExpenseAnomalies(data, tripFull as Trip);
        const filtered = anomalies.filter(a => a.type !== "duplicate" && a.type !== "unbalanced_payer");
        for (const a of filtered) {
          void sendPushToTripMembers(
            data.trip_id,
            { title: a.title, body: a.body, url: a.url, tag: a.tag },
            undefined,
            { category: "anomaly", isAnomaly: true }
          ).catch((e: unknown) => console.error(`[push.anomaly.${a.type}]`, (e as Error).message));
        }
      }
    } catch (e) {
      console.error("[push.anomaly-put] setup failed:", (e as Error).message);
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = serverDb();
  const idParam = new URL(req.url).searchParams.get("id");
  const id = idParam ?? (await req.json().catch(() => ({}))).id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // Look up expense info for role check + push notification
  const { data: exp } = await supabase.from("expenses").select("trip_id, myr_amount, category, notes, paid_by_id").eq("id", id).single();
  if (exp?.trip_id) { const denied = await requireEditor(exp.trip_id); if (denied) return denied; }

  // Block deleting an expense that was settled via Settle All. Its debts are
  // recorded in settlement_payments (which reference travelers, not the
  // expense), so deleting the expense would leave dangling settlement history
  // and skew wallet balances. The user must un-settle it from the Settlement
  // page first. (Per-split manual settles cascade-delete cleanly, so those are
  // fine — only settle_all locks are blocked.)
  {
    const { data: lockedSplit } = await supabase
      .from("expense_splits")
      .select("id")
      .eq("expense_id", id)
      .eq("lock_source", "settle_all")
      .limit(1);
    if (lockedSplit && lockedSplit.length > 0) {
      return NextResponse.json(
        { error: "This expense was settled via Settle All. Un-settle it from the Settlement page before deleting." },
        { status: 409 }
      );
    }
  }

  // Delete receipt photo from storage if it exists
  const { data: files } = await supabase.storage.from("expense-receipts").list(id);
  if (files?.length) {
    await supabase.storage.from("expense-receipts").remove(files.map((f) => `${id}/${f.name}`));
  }
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  {
    const me = await getSessionUser();
    void logActivity({
      action: "expense_delete",
      userId: me?.id ?? null,
      tripId: exp?.trip_id ?? null,
      details: {
        expense_id: id,
        myr_amount: exp?.myr_amount,
        category: exp?.category,
      },
      req,
    });
  }

  // Push: "Expense deleted — RM {amount} · {category}"
  if (exp?.trip_id) {
    try {
      const me = await getSessionUser();
      const { data: trip } = await supabase.from("trips").select("name").eq("id", exp.trip_id).single();
      const tripName = trip?.name ?? "your trip";
      const myr = Number(exp.myr_amount ?? 0).toFixed(0);
      const cat = exp.category ?? "";
      const desc = exp.notes ? ` — ${String(exp.notes).slice(0, 40)}` : "";
      void sendPushToTripMembers(
        exp.trip_id,
        {
          title: `Expense deleted — ${tripName}`,
          body: `RM ${myr} · ${cat}${desc} was removed`,
          url: `/trips/${exp.trip_id}/expenses`,
          tag: `expense-del-${id}`,
        },
        me?.id,
        { category: "expense_delete" }
      ).catch((e: unknown) => console.error("[push.expense-delete]", (e as Error).message));
    } catch (e) {
      console.error("[push.expense-delete] setup failed:", (e as Error).message);
    }
  }

  return NextResponse.json({ success: true });
}
