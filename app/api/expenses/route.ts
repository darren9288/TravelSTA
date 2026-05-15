export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor } from "@/lib/role";
import { getSessionUser } from "@/lib/supabase-server";
import { sendPushToTripMembers } from "@/lib/push";
import { detectExpenseAnomalies, detectPoolOverdraft } from "@/lib/anomalies";
import type { Trip } from "@/lib/supabase";

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

export async function POST(req: NextRequest) {
  const supabase = serverDb();
  const body = await req.json();
  const denied = await requireEditor(body.trip_id);
  if (denied) return denied;

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

  if (body.splits?.length) {
    const { error: splitErr } = await supabase.from("expense_splits").insert(
      body.splits.map((s: { traveler_id: string; amount: number }) => ({
        expense_id: expense.id,
        traveler_id: s.traveler_id,
        amount: s.amount,
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
      me?.id
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
          undefined // Anomalies notify EVERYONE including the triggerer — they need to fix it
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

  const { data, error } = await supabase.from("expenses").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (splits) {
    await supabase.from("expense_splits").delete().eq("expense_id", id);
    await supabase.from("expense_splits").insert(
      splits.map((s: { traveler_id: string; amount: number }) => ({
        expense_id: id, traveler_id: s.traveler_id, amount: s.amount, is_settled: false,
      }))
    );
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
            undefined
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
  // Delete receipt photo from storage if it exists
  const { data: files } = await supabase.storage.from("expense-receipts").list(id);
  if (files?.length) {
    await supabase.storage.from("expense-receipts").remove(files.map((f) => `${id}/${f.name}`));
  }
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
        me?.id
      ).catch((e: unknown) => console.error("[push.expense-delete]", (e as Error).message));
    } catch (e) {
      console.error("[push.expense-delete] setup failed:", (e as Error).message);
    }
  }

  return NextResponse.json({ success: true });
}
