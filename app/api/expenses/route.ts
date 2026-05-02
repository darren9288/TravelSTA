export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

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

  return NextResponse.json(expense, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const supabase = serverDb();
  const body = await req.json();
  const { id, splits, ...updates } = body;

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
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = serverDb();
  const idParam = new URL(req.url).searchParams.get("id");
  const id = idParam ?? (await req.json().catch(() => ({}))).id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
