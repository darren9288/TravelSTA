"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Cashback, Traveler, Expense } from "@/lib/supabase";
import { Coins, Check, Trash2, Clock, History, Eraser } from "lucide-react";

// Manual cashback ledger (Analytics).
//
// Each entry is recorded against an expense and credited to that expense's payer
// — money the payer gets back later (e.g. Ryt card cashback). On NEW expenses the
// cashback is shared into the split at creation; this ledger row is the payer's
// IOU for that float. Adding/editing per-expense happens on the expense itself.
//
// This card also offers a one-time BACKFILL for old expenses (recorded before
// cashback tracking existed): it scans Ryt-wallet expenses with no entry yet and
// pre-fills 1.2% credited to the payer — review/edit/skip, then add. Backfill
// only INSERTS ledger rows; it never changes splits or settlement. A "Clear all"
// button removes every cashback for the trip (full revert).

const RATE = 0.012; // 1.2%

function fmtDate(d?: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[(m ?? 1) - 1]} ${String(y).slice(2)}`;
}

type BackfillRow = { expenseId: string; include: boolean; amount: string; travelerId: string };

export default function CashbackReport({ tripId }: { tripId: string }) {
  const { data, mutate } = useSWR<{ cashbacks: Cashback[] }>(`/api/cashback?trip_id=${tripId}`, fetcher);
  const { data: travelersData } = useSWR<Traveler[]>(`/api/travelers?trip_id=${tripId}`, fetcher);
  const { data: expensesData } = useSWR<Expense[]>(`/api/expenses?trip_id=${tripId}`, fetcher);
  const { data: walletsData } = useSWR<{ wallets: { id: string; name: string }[] }>(`/api/wallets?trip_id=${tripId}`, fetcher);

  const cashbacks = useMemo(() => (Array.isArray(data?.cashbacks) ? data!.cashbacks : []), [data]);
  const people = useMemo(
    () => (Array.isArray(travelersData) ? travelersData : []).filter((t) => !t.is_pool),
    [travelersData]
  );
  const expenses = useMemo(() => (Array.isArray(expensesData) ? expensesData : []), [expensesData]);
  const walletName = useMemo(() => {
    const m = new Map<string, string>();
    (walletsData?.wallets ?? []).forEach((w) => m.set(w.id, w.name));
    return m;
  }, [walletsData]);

  const [filter, setFilter] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [backfillRows, setBackfillRows] = useState<BackfillRow[] | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const rows = useMemo(
    () => (filter ? cashbacks.filter((c) => c.traveler_id === filter) : cashbacks),
    [cashbacks, filter]
  );
  const pending = rows.filter((c) => !c.received);
  const received = rows.filter((c) => c.received);
  const pendingTotal = pending.reduce((s, c) => s + Number(c.amount), 0);
  const receivedTotal = received.reduce((s, c) => s + Number(c.amount), 0);

  // Old Ryt-paid expenses that don't have a cashback entry yet.
  const candidates = useMemo(() => {
    const withCashback = new Set(cashbacks.map((c) => c.expense_id));
    return expenses.filter((e) => {
      if (withCashback.has(e.id)) return false;
      const wn = (e.wallet_id ? walletName.get(e.wallet_id) : "") ?? "";
      return wn.toLowerCase().includes("ryt") || (e.payment_type ?? "").toLowerCase().includes("ryt");
    });
  }, [expenses, cashbacks, walletName]);

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

  function openBackfill() {
    setBackfillRows(candidates.map((e) => ({
      expenseId: e.id,
      include: true,
      amount: (Math.round(Number(e.myr_amount) * RATE * 100) / 100).toFixed(2),
      travelerId: e.paid_by_id,
    })));
  }
  async function runBackfill() {
    if (!backfillRows) return;
    setBackfilling(true);
    for (const r of backfillRows) {
      const amt = parseFloat(r.amount);
      if (!r.include || !amt || amt <= 0) continue;
      await fetch("/api/cashback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId, expense_id: r.expenseId, traveler_id: r.travelerId, amount: amt }),
      }).catch(() => {});
    }
    setBackfilling(false);
    setBackfillRows(null);
    await mutate();
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
        Cashback owed back to each payer. Add it on an expense; tick here once received.
      </p>

      {/* Backfill old Ryt expenses */}
      {candidates.length > 0 && backfillRows === null && (
        <button onClick={openBackfill}
          className="w-full mb-3 flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-700 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 text-xs rounded-lg transition-colors">
          <History size={12} /> Backfill {candidates.length} old Ryt expense{candidates.length === 1 ? "" : "s"} (1.2%)
        </button>
      )}

      {backfillRows !== null && (
        <div className="mb-3 bg-slate-900/50 border border-slate-700 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs text-slate-400">
            Pre-filled 1.2% for each Ryt expense with no cashback yet. Edit the amount, change who earned it, or untick to skip.
            <span className="text-slate-600"> Splits are not touched.</span>
          </p>
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
            {backfillRows.map((r, i) => {
              const e = expenses.find((x) => x.id === r.expenseId);
              return (
                <div key={r.expenseId} className={`flex items-center gap-2 ${r.include ? "" : "opacity-40"}`}>
                  <input type="checkbox" checked={r.include}
                    onChange={(ev) => setBackfillRows((rs) => rs!.map((x, idx) => idx === i ? { ...x, include: ev.target.checked } : x))}
                    className="accent-emerald-500 w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{e?.category} <span className="text-slate-600">· {fmtDate(e?.date)} · RM {Number(e?.myr_amount ?? 0).toFixed(2)}</span></p>
                  </div>
                  <select value={r.travelerId}
                    onChange={(ev) => setBackfillRows((rs) => rs!.map((x, idx) => idx === i ? { ...x, travelerId: ev.target.value } : x))}
                    className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-[11px] text-slate-300 max-w-[84px] focus:outline-none focus:border-emerald-500">
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" step="0.01" value={r.amount}
                    onChange={(ev) => setBackfillRows((rs) => rs!.map((x, idx) => idx === i ? { ...x, amount: ev.target.value } : x))}
                    className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-[11px] text-white text-right focus:outline-none focus:border-emerald-500" />
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setBackfillRows(null)}
              className="flex-1 py-1.5 border border-slate-600 text-slate-400 hover:text-white text-xs rounded-lg transition-colors">Cancel</button>
            <button onClick={runBackfill} disabled={backfilling}
              className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
              {backfilling ? "Adding…" : `Add ${backfillRows.filter((r) => r.include && parseFloat(r.amount) > 0).length} entries`}
            </button>
          </div>
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
          No cashback recorded{filter ? " for this person" : ""} yet.
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
