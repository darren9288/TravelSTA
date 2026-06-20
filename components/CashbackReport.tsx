"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Expense } from "@/lib/supabase";
import { Wallet as WalletIcon, ChevronDown, ChevronUp, Percent } from "lucide-react";

// Ryt cashback tracker — READ ONLY.
//
// Friends pay via Ryt Bank, which charges an exact MYR amount and later credits
// 1.2% cashback to the *payer*. The cashback belongs to whoever paid (it's their
// card), so it does NOT change any split or settlement — this card just TRACKS
// how much each payer will get back from Ryt.
//
// Detection: an expense counts as a Ryt payment if its wallet's name contains
// "ryt" (case-insensitive), or its payment_type contains "ryt". Nothing is
// written to the database — cashback is computed live from existing expenses, so
// it safely covers expenses recorded before this feature existed.
//
// Rate is editable (default 1.2%) and remembered per-trip in localStorage only.

type WalletLite = { id: string; name: string; currency: string; traveler_id: string | null };

function isRyt(e: Expense, walletName: string | undefined): boolean {
  const w = (walletName ?? "").toLowerCase();
  const pt = (e.payment_type ?? "").toLowerCase();
  return w.includes("ryt") || pt.includes("ryt");
}

export default function CashbackReport({ tripId }: { tripId: string }) {
  const { data: expensesData } = useSWR<Expense[]>(`/api/expenses?trip_id=${tripId}`, fetcher);
  const { data: walletsData } = useSWR<WalletLite[]>(`/api/wallets?trip_id=${tripId}`, fetcher);

  const [rate, setRate] = useState(1.2);
  const [open, setOpen] = useState(false);

  // Remember the rate per trip (client-only — never hits the DB).
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(`cashback_rate_${tripId}`) : null;
    if (saved && !isNaN(parseFloat(saved))) setRate(parseFloat(saved));
  }, [tripId]);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(`cashback_rate_${tripId}`, String(rate));
  }, [tripId, rate]);

  const expenses = useMemo(() => (Array.isArray(expensesData) ? expensesData : []), [expensesData]);
  const walletName = useMemo(() => {
    const m = new Map<string, string>();
    (Array.isArray(walletsData) ? walletsData : []).forEach((w) => m.set(w.id, w.name));
    return m;
  }, [walletsData]);

  const { byPayer, total, count, wallets } = useMemo(() => {
    const pct = (isNaN(rate) ? 0 : rate) / 100;
    const map = new Map<string, { name: string; color: string; spent: number; cashback: number; n: number }>();
    const seenWallets = new Set<string>();
    let total = 0;
    let count = 0;
    for (const e of expenses) {
      const wn = e.wallet_id ? walletName.get(e.wallet_id) : undefined;
      if (!isRyt(e, wn)) continue;
      const payer = e.paid_by;
      const key = payer?.id ?? e.paid_by_id;
      const cur = map.get(key) ?? { name: payer?.name ?? "?", color: payer?.color ?? "#64748b", spent: 0, cashback: 0, n: 0 };
      const cb = Number(e.myr_amount) * pct;
      cur.spent += Number(e.myr_amount);
      cur.cashback += cb;
      cur.n += 1;
      map.set(key, cur);
      total += cb;
      count += 1;
      if (wn) seenWallets.add(wn);
    }
    const byPayer = [...map.values()].sort((a, b) => b.cashback - a.cashback);
    return { byPayer, total, count, wallets: [...seenWallets] };
  }, [expenses, walletName, rate]);

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-400">Ryt Cashback to reclaim</h2>
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
          <Percent size={11} className="text-slate-500" />
          <input
            type="number" step="0.1" value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value))}
            className="w-12 bg-transparent text-xs text-white text-right focus:outline-none"
            aria-label="Cashback rate percent"
          />
          <span className="text-xs text-slate-500">%</span>
        </div>
      </div>
      <p className="text-xs text-slate-600 mb-3">
        Estimated cashback owed back to each payer by Ryt. Tracking only — does not affect any split or settlement.
      </p>

      {count === 0 ? (
        <p className="text-sm text-slate-500 py-3">
          No Ryt payments detected. An expense counts when its wallet name (or payment type) contains &quot;Ryt&quot;.
        </p>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-slate-700/40">
            {byPayer.map((p) => (
              <div key={p.name} className="flex items-center gap-3 py-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-600">{p.n} Ryt payment{p.n === 1 ? "" : "s"} · RM {p.spent.toFixed(2)} spent</p>
                </div>
                <span className="text-sm font-medium text-emerald-400 flex-shrink-0">RM {p.cashback.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700">
            <span className="text-xs text-slate-400">Total cashback pending ({count} payment{count === 1 ? "" : "s"})</span>
            <span className="text-base font-bold text-emerald-400">RM {total.toFixed(2)}</span>
          </div>

          {wallets.length > 0 && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 mt-2 transition-colors"
            >
              <WalletIcon size={11} />
              Detected {wallets.length} Ryt wallet{wallets.length === 1 ? "" : "s"}
              {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          )}
          {open && (
            <p className="text-[11px] text-slate-600 mt-1 pl-4">{wallets.join(", ")}</p>
          )}
        </>
      )}
    </div>
  );
}
