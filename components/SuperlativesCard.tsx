"use client";
import { useMemo } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Expense, Traveler } from "@/lib/supabase";

// Fun "trip superlatives" card for the Analytics page. Pure client-side
// computation from /api/expenses (+ travelers). Designed to be screenshot-able
// at trip end. Renders nothing until there are a few expenses.

type Superlative = { emoji: string; label: string; value: string; sub?: string };

export default function SuperlativesCard({ tripId }: { tripId: string }) {
  const { data: expensesData } = useSWR<Expense[]>(`/api/expenses?trip_id=${tripId}`, fetcher);
  const { data: travelersData } = useSWR<Traveler[]>(`/api/travelers?trip_id=${tripId}`, fetcher);

  const expenses = useMemo(() => (Array.isArray(expensesData) ? expensesData : []), [expensesData]);
  const travelers = useMemo(() => (Array.isArray(travelersData) ? travelersData : []), [travelersData]);

  const supers = useMemo<Superlative[]>(() => {
    if (expenses.length < 3) return [];
    const nameOf = (id: string) => travelers.find((t) => t.id === id)?.name ?? "?";
    const realIds = new Set(travelers.filter((t) => !t.is_pool).map((t) => t.id));

    // Biggest spender — highest sum of split shares.
    const shareByTraveler: Record<string, number> = {};
    // Paid the most — highest sum of expenses they fronted (real people only).
    const paidByTraveler: Record<string, number> = {};
    // Category totals.
    const catTotal: Record<string, number> = {};
    // Spend per day.
    const dayTotal: Record<string, number> = {};
    const dayCount: Record<string, number> = {};

    let priciest: { amount: number; label: string; date: string } | null = null;

    for (const e of expenses) {
      const amt = Number(e.myr_amount);
      catTotal[e.category] = (catTotal[e.category] ?? 0) + amt;
      dayTotal[e.date] = (dayTotal[e.date] ?? 0) + amt;
      dayCount[e.date] = (dayCount[e.date] ?? 0) + 1;
      if (realIds.has(e.paid_by_id)) {
        paidByTraveler[e.paid_by_id] = (paidByTraveler[e.paid_by_id] ?? 0) + amt;
      }
      for (const s of e.splits ?? []) {
        shareByTraveler[s.traveler_id] = (shareByTraveler[s.traveler_id] ?? 0) + Number(s.amount);
      }
      if (!priciest || amt > priciest.amount) {
        priciest = { amount: amt, label: e.category, date: e.date };
      }
    }

    function topEntry(rec: Record<string, number>): [string, number] | null {
      const entries = Object.entries(rec);
      if (!entries.length) return null;
      return entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    }

    const out: Superlative[] = [];

    const bigSpender = topEntry(shareByTraveler);
    if (bigSpender) out.push({ emoji: "🏆", label: "Biggest spender", value: nameOf(bigSpender[0]), sub: `RM ${bigSpender[1].toFixed(0)} share` });

    const topPayer = topEntry(paidByTraveler);
    if (topPayer) out.push({ emoji: "💳", label: "Fronted the most", value: nameOf(topPayer[0]), sub: `RM ${topPayer[1].toFixed(0)} paid` });

    if (priciest) out.push({ emoji: "💸", label: "Priciest expense", value: `RM ${priciest.amount.toFixed(0)}`, sub: priciest.label });

    const topCat = topEntry(catTotal);
    if (topCat) out.push({ emoji: "📊", label: "Top category", value: topCat[0], sub: `RM ${topCat[1].toFixed(0)}` });

    const bigDay = topEntry(dayTotal);
    if (bigDay) {
      const [y, m, d] = bigDay[0].split("-").map(Number);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      out.push({ emoji: "🔥", label: "Biggest day", value: `${d} ${months[(m ?? 1) - 1]}`, sub: `RM ${bigDay[1].toFixed(0)}` });
    }

    out.push({ emoji: "🧾", label: "Total expenses", value: String(expenses.length), sub: `over ${Object.keys(dayTotal).length} day${Object.keys(dayTotal).length === 1 ? "" : "s"}` });

    return out;
  }, [expenses, travelers]);

  if (supers.length === 0) return null;

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-slate-400 mb-3">Trip Superlatives 🎉</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {supers.map((s) => (
          <div key={s.label} className="bg-slate-900/40 border border-slate-700/40 rounded-xl p-3 flex flex-col gap-0.5">
            <span className="text-xl leading-none">{s.emoji}</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{s.label}</span>
            <span className="text-sm font-bold text-white truncate" title={s.value}>{s.value}</span>
            {s.sub && <span className="text-[11px] text-slate-500 truncate">{s.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
