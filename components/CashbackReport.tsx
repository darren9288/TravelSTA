"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Cashback, Traveler } from "@/lib/supabase";
import { Coins, Check, Trash2, Clock } from "lucide-react";

// Manual cashback ledger (Analytics).
//
// Each entry is recorded against an expense and credited to that expense's payer
// — it's money the payer will get back later (e.g. Ryt card cashback). Pure
// side-ledger: it never affects splits or settlement.
//
// Here you can: filter by traveller, tick an entry received (pending -> done),
// and delete one. Adding/editing the amount happens on the expense itself (its
// edit modal), keeping each cashback tied to its expense.

function fmtDate(d?: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[(m ?? 1) - 1]} ${String(y).slice(2)}`;
}

export default function CashbackReport({ tripId }: { tripId: string }) {
  const { data, mutate } = useSWR<{ cashbacks: Cashback[] }>(`/api/cashback?trip_id=${tripId}`, fetcher);
  const { data: travelersData } = useSWR<Traveler[]>(`/api/travelers?trip_id=${tripId}`, fetcher);

  const cashbacks = useMemo(() => (Array.isArray(data?.cashbacks) ? data!.cashbacks : []), [data]);
  const people = useMemo(
    () => (Array.isArray(travelersData) ? travelersData : []).filter((t) => !t.is_pool),
    [travelersData]
  );

  const [filter, setFilter] = useState<string>(""); // "" = all travellers
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(
    () => (filter ? cashbacks.filter((c) => c.traveler_id === filter) : cashbacks),
    [cashbacks, filter]
  );
  const pending = rows.filter((c) => !c.received);
  const received = rows.filter((c) => c.received);
  const pendingTotal = pending.reduce((s, c) => s + Number(c.amount), 0);
  const receivedTotal = received.reduce((s, c) => s + Number(c.amount), 0);

  async function toggle(c: Cashback) {
    setBusy(c.id);
    await fetch("/api/cashback", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
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

  function Row({ c }: { c: Cashback }) {
    const name = c.traveler?.name ?? people.find((p) => p.id === c.traveler_id)?.name ?? "?";
    const color = c.traveler?.color ?? people.find((p) => p.id === c.traveler_id)?.color ?? "#64748b";
    return (
      <div className="flex items-center gap-2 py-2">
        <button
          onClick={() => toggle(c)}
          disabled={busy === c.id}
          title={c.received ? "Mark pending" : "Mark received"}
          className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
            c.received ? "bg-emerald-500 border-emerald-500" : "border-slate-500 hover:border-emerald-400"
          } ${busy === c.id ? "opacity-50" : ""}`}
        >
          {c.received && <Check size={12} className="text-white" />}
        </button>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm truncate ${c.received ? "text-slate-500 line-through" : "text-white"}`}>{name}</p>
          <p className="text-[10px] text-slate-600 truncate">
            {c.expense?.category ?? "expense"}{c.expense?.date ? ` · ${fmtDate(c.expense.date)}` : ""}{c.note ? ` · ${c.note}` : ""}
          </p>
        </div>
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
      <div className="flex items-center gap-2 mb-1">
        <Coins size={15} className="text-emerald-400" />
        <h2 className="text-sm font-semibold text-slate-400">Cashback ledger</h2>
      </div>
      <p className="text-xs text-slate-600 mb-3">
        Cashback owed back to each payer. Add it on an expense; tick here once received.
      </p>

      {/* Traveller filter */}
      {people.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button onClick={() => setFilter("")}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
              !filter ? "border-emerald-500 bg-emerald-500/10 text-white" : "border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200"
            }`}>
            Everyone
          </button>
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
          No cashback recorded{filter ? " for this person" : ""} yet. Add it in the Cashback field when creating or editing an expense.
        </p>
      ) : (
        <>
          {/* Pending */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-amber-400 flex items-center gap-1"><Clock size={11} /> Pending</span>
            <span className="text-sm font-bold text-emerald-400">RM {pendingTotal.toFixed(2)}</span>
          </div>
          {pending.length === 0 ? (
            <p className="text-xs text-slate-600 pb-2">Nothing pending.</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-700/40 mb-2">{pending.map((c) => <Row key={c.id} c={c} />)}</div>
          )}

          {/* Received */}
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
