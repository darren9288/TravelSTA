export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const tripId = p.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const supabase = db();
  const { data: expenses, error } = await supabase
    .from("expenses")
    .select("date, category, myr_amount, paid_by_id, splits:expense_splits(traveler_id, amount), paid_by:travelers!paid_by_id(name, color)")
    .eq("trip_id", tripId)
    .order("date");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byCategory: Record<string, number> = {};
  const byDate: Record<string, number> = {};
  const byTraveler: Record<string, { name: string; color: string; amount: number }> = {};
  let total = 0;

  for (const e of expenses ?? []) {
    const amt = Number(e.myr_amount);
    total += amt;
    byCategory[e.category] = (byCategory[e.category] ?? 0) + amt;
    byDate[e.date] = (byDate[e.date] ?? 0) + amt;

    // Per traveler based on their split
    for (const s of (e.splits as { traveler_id: string; amount: number }[] ?? [])) {
      if (!byTraveler[s.traveler_id]) {
        const pb = e.paid_by as unknown as { name: string; color: string } | null;
        byTraveler[s.traveler_id] = { name: "Unknown", color: "#94a3b8", amount: 0 };
        void pb;
      }
      byTraveler[s.traveler_id].amount += Number(s.amount);
    }
  }

  // Load traveler names for byTraveler
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
