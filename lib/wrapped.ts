// Trip Wrapped — turns the raw trip data into the handful of numbers the
// story cards show. Pure: no fetching, no React, so it can be reasoned about
// (and tested) on its own.
//
// Deliberately only uses fields that are actually populated in practice:
// date, category, myr_amount, paid_by_id and expense_splits.amount. Receipt
// photos and the cashback ledger are empty in real trips, and roughly half of
// expenses have no `time`, so there are no cards built on those — a card that
// says "0" is worse than no card.
import { Expense, Traveler, Trip } from "./supabase";

export type WrappedPerson = { id: string; name: string; color: string; amount: number };

export type WrappedData = {
  tripName: string;
  destination: string | null;
  dateLabel: string | null;
  travelerCount: number;
  expenseCount: number;
  dayCount: number;
  total: number;
  perDay: number;
  byDay: { date: string; amount: number }[];
  topCategory: { name: string; amount: number; pct: number } | null;
  biggest: { category: string; amount: number; date: string; payer: string; color: string } | null;
  busiestDay: { date: string; amount: number; count: number } | null;
  /** Who put money down (excludes pool wallets) — the podium. */
  fronted: WrappedPerson[];
  /** What each person actually consumed, from their splits. */
  shares: WrappedPerson[];
  budget: { total: number; left: number; pct: number } | null;
};

function fmtDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

export function buildWrapped(trip: Trip, expenses: Expense[], travelers: Traveler[]): WrappedData {
  const byId = new Map(travelers.map((t) => [t.id, t]));
  const isPool = (id?: string | null) => (id ? byId.get(id)?.is_pool === true : false);

  let total = 0;
  const byCategory = new Map<string, number>();
  const byDate = new Map<string, { amount: number; count: number }>();
  const frontedMap = new Map<string, number>();
  const shareMap = new Map<string, number>();
  let biggest: WrappedData["biggest"] = null;

  for (const e of expenses) {
    const amt = Number(e.myr_amount) || 0;
    total += amt;

    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + amt);

    const day = byDate.get(e.date) ?? { amount: 0, count: 0 };
    day.amount += amt;
    day.count += 1;
    byDate.set(e.date, day);

    // Who fronted the cash. Pool-paid expenses have no individual payer, so
    // they're left out of the podium (the money came from the shared kitty).
    if (e.paid_by_id && !isPool(e.paid_by_id)) {
      frontedMap.set(e.paid_by_id, (frontedMap.get(e.paid_by_id) ?? 0) + amt);
    }

    for (const s of e.splits ?? []) {
      if (isPool(s.traveler_id)) continue;
      shareMap.set(s.traveler_id, (shareMap.get(s.traveler_id) ?? 0) + (Number(s.amount) || 0));
    }

    if (!biggest || amt > biggest.amount) {
      const payer = e.paid_by ?? (e.paid_by_id ? byId.get(e.paid_by_id) : undefined);
      biggest = {
        category: e.category,
        amount: amt,
        date: e.date,
        payer: payer?.name ?? "Someone",
        color: payer?.color ?? "#94a3b8",
      };
    }
  }

  const toPeople = (m: Map<string, number>): WrappedPerson[] =>
    [...m.entries()]
      .map(([id, amount]) => {
        const t = byId.get(id);
        return { id, name: t?.name ?? "Unknown", color: t?.color ?? "#94a3b8", amount };
      })
      .sort((a, b) => b.amount - a.amount);

  const byDay = [...byDate.entries()]
    .map(([date, v]) => ({ date, amount: v.amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const busiestEntry = [...byDate.entries()].sort((a, b) => b[1].amount - a[1].amount)[0];
  const topCatEntry = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  // Prefer the trip's own date range; fall back to the span of real expenses
  // so a trip with no dates set still gets a sensible count.
  const dayCount = trip.start_date && trip.end_date
    ? Math.max(
        1,
        Math.round(
          (new Date(trip.end_date + "T00:00:00").getTime() -
            new Date(trip.start_date + "T00:00:00").getTime()) / 86400000
        ) + 1
      )
    : Math.max(1, byDate.size);

  const dateLabel = trip.start_date
    ? trip.end_date
      ? `${fmtDay(trip.start_date)} – ${fmtDay(trip.end_date)} ${new Date(trip.end_date + "T00:00:00").getFullYear()}`
      : fmtDay(trip.start_date)
    : byDay.length
      ? `${fmtDay(byDay[0].date)} – ${fmtDay(byDay[byDay.length - 1].date)}`
      : null;

  // total_budget lives on the trip but isn't in the shared Trip type (the
  // budget UI owns its own shape), so read it defensively.
  const rawBudget = Number((trip as unknown as { total_budget?: number | null }).total_budget ?? 0);
  const budget = rawBudget > 0
    ? { total: rawBudget, left: rawBudget - total, pct: (total / rawBudget) * 100 }
    : null;

  return {
    tripName: trip.name,
    destination: trip.destination || null,
    dateLabel,
    travelerCount: travelers.filter((t) => !t.is_pool && !t.archived).length,
    expenseCount: expenses.length,
    dayCount,
    total,
    perDay: total / Math.max(1, dayCount),
    byDay,
    topCategory: topCatEntry
      ? { name: topCatEntry[0], amount: topCatEntry[1], pct: total > 0 ? (topCatEntry[1] / total) * 100 : 0 }
      : null,
    biggest,
    busiestDay: busiestEntry
      ? { date: busiestEntry[0], amount: busiestEntry[1].amount, count: busiestEntry[1].count }
      : null,
    fronted: toPeople(frontedMap),
    shares: toPeople(shareMap),
    budget,
  };
}

/** Short money string for big display type — "30,670" (no decimals). */
export function money0(n: number): string {
  return Math.round(n).toLocaleString("en-MY");
}

export function fmtDate(iso: string): string {
  return fmtDay(iso);
}
