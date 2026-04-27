export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const tripId = p.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const supabase = serverDb();
  const { data: expenses, error } = await supabase
    .from("expenses")
    .select("date, category, myr_amount, paid_by_id, paid_by:travelers!paid_by_id(name, color)")
    .eq("trip_id", tripId)
    .order("date");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: splits } = await supabase
    .from("expense_splits")
    .select("expense_id, traveler_id, amount")
    .in("expense_id", (expenses ?? []).map((e) => e.id));

  const byCategory: Record<string, number> = {};
  const byDate: Record<string, number> = {};
  const byTraveler: Record<string, { name: string; color: string; amount: number }> = {};
  let total = 0;

  for (const e of expenses ?? []) {
    const amt = Number(e.myr_amount);
    total += amt;
    byCategory[e.category] = (byCategory[e.category] ?? 0) + amt;
    byDate[e.date] = (byDate[e.date] ?? 0) + amt;

    for (const s of (splits ?? []).filter((s) => s.expense_id === e.id)) {
      if (!byTraveler[s.traveler_id]) {
        byTraveler[s.traveler_id] = { name: "Unknown", color: "#94a3b8", amount: 0 };
      }
      byTraveler[s.traveler_id].amount += Number(s.amount);
    }
  }

  const { data: travelers } = await supabase
    .from("travelers")
    .select("id, name, color")
    .eq("trip_id", tripId);

  for (const t of travelers ?? []) {
    if (byTraveler[t.id]) {
      byTraveler[t.id].name = t.name;
      byTraveler[t.id].color = t.color;
    }
  }

  return NextResponse.json({
    total,
    byCategory: Object.entries(byCategory).map(([name, amount]) => ({ name, amount, color: "#10b981" })),
    byDay: Object.entries(byDate).map(([date, amount]) => ({ date, amount })),
    byTraveler: Object.entries(byTraveler).map(([id, v]) => ({ id, ...v })),
  });
}
