"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Expense, Traveler } from "@/lib/supabase";
import { ArrowDownUp, CalendarRange, X, FileDown } from "lucide-react";

// Per-person spending drill-down for the Analytics page.
//
// "Spending" here = a traveler's SHARE of each expense (their expense_splits
// row), i.e. what they personally consumed — consistent with the existing
// "Per Traveler (share paid)" chart. Not what they fronted/paid.
//
// Controls:
//   - Person selector (real, non-archived travelers)
//   - Sort: date oldest→newest, date newest→oldest, amount high→low, low→high
//   - Custom date range (from / to, inclusive) — blank = all dates
//
// Data comes from /api/expenses (already returns splits + paid_by), so no new
// endpoint is needed. Filtering/sorting is done client-side.

type SortMode = "date_asc" | "date_desc" | "amt_desc" | "amt_asc";

const SORTS: { value: SortMode; label: string }[] = [
  { value: "date_asc", label: "Date — oldest first" },
  { value: "date_desc", label: "Date — newest first" },
  { value: "amt_desc", label: "Amount — high → low" },
  { value: "amt_asc", label: "Amount — low → high" },
];

type Row = {
  expenseId: string;
  date: string;
  time: string; // "HH:MM" or "" — used as a secondary sort key within a day
  category: string;
  notes: string | null;
  amount: number;
  payer: string;
};

export default function PerPersonSpending({ tripId }: { tripId: string }) {
  const { data: expensesData } = useSWR<Expense[]>(`/api/expenses?trip_id=${tripId}`, fetcher);
  const { data: travelersData } = useSWR<Traveler[]>(`/api/travelers?trip_id=${tripId}`, fetcher);

  const expenses = useMemo(() => (Array.isArray(expensesData) ? expensesData : []), [expensesData]);
  // Real people only — exclude pool wallets + archived travelers.
  const people = useMemo(
    () => (Array.isArray(travelersData) ? travelersData : []).filter((t) => !t.is_pool && !t.archived),
    [travelersData]
  );

  const [travelerId, setTravelerId] = useState<string>("");
  const [sort, setSort] = useState<SortMode>("date_asc");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Default the selected person to the first one once data arrives.
  const activeId = travelerId || people[0]?.id || "";

  const rows = useMemo<Row[]>(() => {
    if (!activeId) return [];
    const out: Row[] = [];
    for (const e of expenses) {
      const split = (e.splits ?? []).find((s) => s.traveler_id === activeId);
      if (!split) continue;
      const amount = Number(split.amount);
      if (amount === 0) continue; // skip zero-share rows (not real spending)
      if (from && e.date < from) continue;
      if (to && e.date > to) continue;
      out.push({
        expenseId: e.id,
        date: e.date,
        time: e.time ?? "",
        category: e.category,
        notes: e.notes ?? null,
        amount,
        payer: e.paid_by?.name ?? "?",
      });
    }
    // Chronological sort keys include the time-of-day so two expenses on the same
    // date order by when they happened. Missing times sort first within a day.
    const key = (r: Row) => `${r.date}T${r.time || "00:00"}`;
    out.sort((a, b) => {
      switch (sort) {
        case "date_asc": return key(a).localeCompare(key(b)) || a.category.localeCompare(b.category);
        case "date_desc": return key(b).localeCompare(key(a)) || a.category.localeCompare(b.category);
        case "amt_desc": return b.amount - a.amount;
        case "amt_asc": return a.amount - b.amount;
      }
    });
    return out;
  }, [expenses, activeId, sort, from, to]);

  const subtotal = rows.reduce((s, r) => s + r.amount, 0);
  const activePerson = people.find((p) => p.id === activeId);

  // Statement PDF respects the current person + date range.
  const statementUrl = activeId
    ? `/api/trips/${tripId}/statement-pdf?traveler_id=${activeId}` +
      (from ? `&from=${from}` : "") +
      (to ? `&to=${to}` : "")
    : "#";

  function fmtDate(d: string) {
    // d is YYYY-MM-DD; render as "5 Jun" without timezone shifting.
    const [y, m, day] = d.split("-").map(Number);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${day} ${months[(m ?? 1) - 1]} ${String(y).slice(2)}`;
  }

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-slate-400 mb-3">Per-Person Spending</h2>

      {people.length === 0 ? (
        <p className="text-sm text-slate-500">No travelers yet.</p>
      ) : (
        <>
          {/* Person selector */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {people.map((p) => {
              const active = p.id === activeId;
              return (
                <button
                  key={p.id}
                  onClick={() => setTravelerId(p.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    active
                      ? "border-emerald-500 bg-emerald-500/10 text-white"
                      : "border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                </button>
              );
            })}
          </div>

          {/* Controls: sort + date range */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="flex items-center gap-1.5 flex-1">
              <ArrowDownUp size={13} className="text-slate-500 flex-shrink-0" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <CalendarRange size={13} className="text-slate-500 flex-shrink-0" />
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                aria-label="From date"
              />
              <span className="text-xs text-slate-600">→</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                aria-label="To date"
              />
              {(from || to) && (
                <button
                  onClick={() => { setFrom(""); setTo(""); }}
                  className="p-1 text-slate-500 hover:text-white transition-colors"
                  aria-label="Clear date range"
                  title="Clear date range"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Subtotal + statement download */}
          <div className="flex items-center justify-between mb-2 px-1 gap-2">
            <span className="text-xs text-slate-500 min-w-0 truncate">
              {activePerson?.name}&apos;s share · {rows.length} item{rows.length === 1 ? "" : "s"}
              {(from || to) ? " (filtered)" : ""}
            </span>
            <div className="flex items-center gap-3 flex-shrink-0">
              {rows.length > 0 && (
                <a
                  href={statementUrl}
                  download
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400 transition-colors"
                  title="Download this person's statement as PDF"
                >
                  <FileDown size={12} /> Statement
                </a>
              )}
              <span className="text-sm font-bold text-emerald-400">RM {subtotal.toFixed(2)}</span>
            </div>
          </div>

          {/* List */}
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              No spending for {activePerson?.name ?? "this person"}{(from || to) ? " in this range" : ""}.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-700/40">
              {rows.map((r) => (
                <div key={r.expenseId} className="flex items-center gap-3 py-2">
                  <span className="w-14 text-[11px] font-mono text-slate-500 flex-shrink-0 leading-tight">
                    {fmtDate(r.date)}{r.time ? <span className="block text-slate-600">{r.time}</span> : null}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{r.category}</p>
                    {r.notes && r.notes.trim().toLowerCase() !== r.category.trim().toLowerCase() && (
                      <p className="text-xs text-slate-500 truncate">{r.notes}</p>
                    )}
                    <p className="text-[10px] text-slate-600">paid by {r.payer}</p>
                  </div>
                  <span className="text-sm font-medium text-white flex-shrink-0">RM {r.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
