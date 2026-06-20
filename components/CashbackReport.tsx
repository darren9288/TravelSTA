"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Cashback, Traveler } from "@/lib/supabase";
import { Coins, Check, Trash2, Clock, Eraser, ArrowDownUp, ChevronRight } from "lucide-react";

type SortMode = "date_desc" | "date_asc" | "person" | "amt_desc";
const SORTS: { value: SortMode; label: string }[] = [
  { value: "date_desc", label: "Date & time — newest" },
  { value: "date_asc", label: "Date & time — oldest" },
  { value: "person", label: "Person (A→Z)" },
  { value: "amt_desc", label: "Amount — high → low" },
];

// Manual cashback ledger (Analytics) — view + tick only.
//
// Cashback is entered MANUALLY per person on each expense (the expense's Add /
// Edit cashback fields) — it's pure tracking and never touches splits or
// settlement. This card just lists those entries so you can filter by traveller,
// tick each pending -> received, and see pending vs received totals. "Clear all"
// wipes every cashback for the trip (full revert; nothing else is affected).

function fmtDate(d?: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[(m ?? 1) - 1]} ${String(y).slice(2)}`;
}

export default function CashbackReport({ tripId }: { tripId: string }) {
  const router = useRouter();
  const { data, mutate } = useSWR<{ cashbacks: Cashback[] }>(`/api/cashback?trip_id=${tripId}`, fetcher);
  const { data: travelersData } = useSWR<Traveler[]>(`/api/travelers?trip_id=${tripId}`, fetcher);

  const cashbacks = useMemo(() => (Array.isArray(data?.cashbacks) ? data!.cashbacks : []), [data]);
  const people = useMemo(
    () => (Array.isArray(travelersData) ? travelersData : []).filter((t) => !t.is_pool),
    [travelersData]
  );

  const [filter, setFilter] = useState<string>("");
  const [sort, setSort] = useState<SortMode>("date_desc");
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(
    () => (filter ? cashbacks.filter((c) => c.traveler_id === filter) : cashbacks),
    [cashbacks, filter]
  );
  // Sort key uses the EXPENSE's date + time-of-day so entries order by when the
  // spend happened (not when the cashback row was typed).
  const tkey = (c: Cashback) => `${c.expense?.date ?? ""}T${c.expense?.time ?? "00:00"}`;
  const sortCb = (arr: Cashback[]) => {
    const a = [...arr];
    a.sort((x, y) => {
      switch (sort) {
        case "date_desc": return tkey(y).localeCompare(tkey(x));
        case "date_asc": return tkey(x).localeCompare(tkey(y));
        case "person": return (x.traveler?.name ?? "").localeCompare(y.traveler?.name ?? "") || tkey(y).localeCompare(tkey(x));
        case "amt_desc": return Number(y.amount) - Number(x.amount);
      }
      return 0;
    });
    return a;
  };
  const pending = sortCb(rows.filter((c) => !c.received));
  const received = sortCb(rows.filter((c) => c.received));
  const pendingTotal = pending.reduce((s, c) => s + Number(c.amount), 0);
  const receivedTotal = received.reduce((s, c) => s + Number(c.amount), 0);

  async function toggle(c: Cashback) {
    setBusy(c.id);
    await fetch("/api/cashback", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, received: !c.received }),
    }).catch(() => {});
    await mutate();
    setBusy(null);
  }
  async function remove(c: Cashback) {
    if (!window.confirm("Delete this cashback entry?")) return;
    setBusy(c.id);
    await fetch(`/api/cashback?id=${c.id}`, { method: "DELETE" }).catch(() => {});
    await mutate();
    setBusy(null);
  }
  async function clearAll() {
    if (!window.confirm(`Delete ALL ${cashbacks.length} cashback entries for this trip?\n\nThis only clears the cashback ledger — your expenses, splits and settlement are untouched.`)) return;
    setBusy("all");
    await fetch(`/api/cashback?all=1&trip_id=${tripId}`, { method: "DELETE" }).catch(() => {});
    await mutate();
    setBusy(null);
  }

  function Row({ c }: { c: Cashback }) {
    const name = c.traveler?.name ?? people.find((p) => p.id === c.traveler_id)?.name ?? "?";
    const color = c.traveler?.color ?? people.find((p) => p.id === c.traveler_id)?.color ?? "#64748b";
    return (
      <div className="flex items-center gap-2 py-2">
        <button onClick={() => toggle(c)} disabled={busy === c.id}
          title={c.received ? "Mark pending" : "Mark received"}
          className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
            c.received ? "bg-emerald-500 border-emerald-500" : "border-slate-500 hover:border-emerald-400"
          } ${busy === c.id ? "opacity-50" : ""}`}>
          {c.received && <Check size={12} className="text-white" />}
        </button>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        {/* Tap the body to jump to the source expense */}
        <button onClick={() => router.push(`/trips/${tripId}/expenses?expense=${c.expense_id}`)}
          className="flex-1 min-w-0 flex items-center gap-1 text-left group" title="Go to this expense">
          <span className="flex-1 min-w-0">
            <span className={`block text-sm truncate ${c.received ? "text-slate-500 line-through" : "text-white group-hover:text-emerald-300"}`}>{name}</span>
            <span className="block text-[10px] text-slate-600 truncate">
              {c.expense?.category ?? "expense"}{c.expense?.date ? ` · ${fmtDate(c.expense.date)}` : ""}{c.expense?.time ? ` ${c.expense.time}` : ""}{c.note ? ` · ${c.note}` : ""}
            </span>
          </span>
          <ChevronRight size={12} className="text-slate-600 group-hover:text-emerald-400 flex-shrink-0" />
        </button>
        <span className={`text-sm font-medium flex-shrink-0 ${c.received ? "text-slate-500" : "text-emerald-400"}`}>
          RM {Number(c.amount).toFixed(2)}
        </span>
        <button onClick={() => remove(c)} disabled={busy === c.id}
          className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0" title="Delete">
          <Trash2 size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Coins size={15} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-400">Cashback ledger</h2>
        </div>
        {cashbacks.length > 0 && (
          <button onClick={clearAll} disabled={busy === "all"}
            className="flex items-center gap-1 text-[11px] text-slate-600 hover:text-red-400 transition-colors disabled:opacity-50" title="Delete every cashback entry (revert)">
            <Eraser size={11} /> Clear all
          </button>
        )}
      </div>
      <p className="text-xs text-slate-600 mb-3">
        Cashback owed back to each payer. Add it per person by editing an expense; tick here once received. Tap an entry to open its expense.
      </p>

      {/* Sort */}
      {cashbacks.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2">
          <ArrowDownUp size={13} className="text-slate-500 flex-shrink-0" />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      )}

      {/* Traveller filter */}
      {people.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button onClick={() => setFilter("")}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
              !filter ? "border-emerald-500 bg-emerald-500/10 text-white" : "border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200"
            }`}>Everyone</button>
          {people.map((p) => (
            <button key={p.id} onClick={() => setFilter(p.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                filter === p.id ? "border-emerald-500 bg-emerald-500/10 text-white" : "border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200"
              }`}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 py-3">
          No cashback recorded{filter ? " for this person" : ""} yet. Add it in the Cashback field when editing an expense.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-amber-400 flex items-center gap-1"><Clock size={11} /> Pending</span>
            <span className="text-sm font-bold text-emerald-400">RM {pendingTotal.toFixed(2)}</span>
          </div>
          {pending.length === 0 ? (
            <p className="text-xs text-slate-600 pb-2">Nothing pending.</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-700/40 mb-2">{pending.map((c) => <Row key={c.id} c={c} />)}</div>
          )}

          {received.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-1 mt-2 pt-2 border-t border-slate-700">
                <span className="text-xs text-slate-500 flex items-center gap-1"><Check size={11} /> Received</span>
                <span className="text-sm font-medium text-slate-400">RM {receivedTotal.toFixed(2)}</span>
              </div>
              <div className="flex flex-col divide-y divide-slate-700/40">{received.map((c) => <Row key={c.id} c={c} />)}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
