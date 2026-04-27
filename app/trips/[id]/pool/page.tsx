"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip, Traveler, PoolTopup, Expense } from "@/lib/supabase";
import { getIdentity } from "@/lib/identity";
import { Plus, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";

export default function PoolPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [pools, setPools] = useState<Traveler[]>([]);
  const [topups, setTopups] = useState<PoolTopup[]>([]);
  const [poolExpenses, setPoolExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [myId, setMyId] = useState<string | null>(null);

  // Form
  const [poolId, setPoolId] = useState("");
  const [contributorId, setContributorId] = useState("");
  const [myrAmount, setMyrAmount] = useState("");
  const [foreignAmount, setForeignAmount] = useState("");
  const [topupDate, setTopupDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [tripRes, travelerRes, poolRes] = await Promise.all([
      fetch(`/api/trips/${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/travelers?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/pool?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    setTrip(tripRes.error ? null : tripRes);
    const allTravelers: Traveler[] = Array.isArray(travelerRes) ? travelerRes : [];
    setTravelers(allTravelers.filter((t) => !t.is_pool));
    const poolList = allTravelers.filter((t) => t.is_pool);
    setPools(poolList);
    setTopups(Array.isArray(poolRes.topups) ? poolRes.topups : []);
    setPoolExpenses(Array.isArray(poolRes.expenses) ? poolRes.expenses : []);
    setBalances(poolRes.balances ?? {});
    const me = getIdentity(id);
    setMyId(me);
    setContributorId(me ?? allTravelers.filter((t) => !t.is_pool)[0]?.id ?? "");
    setPoolId(poolList[0]?.id ?? "");
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  async function handleTopup() {
    if (!myrAmount || !poolId || !contributorId) { setError("Fill in all fields."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: id, pool_id: poolId, contributed_by_id: contributorId,
          myr_amount: parseFloat(myrAmount),
          foreign_amount: parseFloat(foreignAmount) || null,
          date: topupDate, notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMyrAmount(""); setForeignAmount(""); setNotes("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Nav tripId={id} tripName={trip?.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Pool</h1>
            <div className="flex items-center gap-2">
              <button onClick={load} disabled={loading}
                className="flex items-center gap-1 px-2 py-1 bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-400 text-xs rounded-lg transition-colors disabled:opacity-50">
                <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
              <button onClick={() => setShowForm((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors">
                <Plus size={14} /> Top Up
              </button>
            </div>
          </div>

          {/* Pool balances */}
          <div className="flex flex-col gap-3">
            {pools.map((p) => (
              <div key={p.id} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.pool_currency}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${(balances[p.id] ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      RM {(balances[p.id] ?? 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-600">remaining</p>
                  </div>
                </div>
              </div>
            ))}
            {pools.length === 0 && !loading && (
              <p className="text-center text-slate-500 text-sm py-4">No pools set up for this trip.</p>
            )}
          </div>

          {/* Top-up form */}
          {showForm && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-white">Add Top-Up</h2>
              <div><label className="text-xs text-slate-400 mb-1 block">Pool</label>
                <select value={poolId} onChange={(e) => setPoolId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                  {pools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Contributed By</label>
                <select value={contributorId} onChange={(e) => setContributorId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                  {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">MYR Amount *</label>
                  <input type="number" value={myrAmount} onChange={(e) => setMyrAmount(e.target.value)} placeholder="e.g. 200" step="0.01"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">{trip?.foreign_currency} Amount</label>
                  <input type="number" value={foreignAmount} onChange={(e) => setForeignAmount(e.target.value)} placeholder="Optional" step="1"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Date</label>
                  <input type="date" value={topupDate} onChange={(e) => setTopupDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Notes</label>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2 border border-slate-600 text-slate-400 text-sm rounded-xl hover:text-white transition-colors">Cancel</button>
                <button onClick={handleTopup} disabled={saving}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                  {saving ? "Saving..." : "Add Top-Up"}
                </button>
              </div>
            </div>
          )}

          {/* Unified history: top-ups (IN) + pool expenses (OUT) */}
          <div>
            <h2 className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">History</h2>
            {loading ? (
              <div className="flex flex-col gap-2">
                {[1, 2].map((i) => <div key={i} className="h-12 bg-slate-800 rounded-xl animate-pulse" />)}
              </div>
            ) : topups.length === 0 && poolExpenses.length === 0 ? (
              <p className="text-center py-6 text-slate-600 text-sm">No history yet</p>
            ) : (() => {
              type Entry =
                | { kind: "topup"; date: string; key: string; topup: PoolTopup }
                | { kind: "expense"; date: string; key: string; expense: Expense };

              const entries: Entry[] = [
                ...topups.map((t) => ({ kind: "topup" as const, date: t.date, key: `t-${t.id}`, topup: t })),
                ...poolExpenses.map((e) => ({ kind: "expense" as const, date: e.date, key: `e-${e.id}`, expense: e })),
              ].sort((a, b) => b.date.localeCompare(a.date));

              return (
                <div className="flex flex-col gap-2">
                  {entries.map((entry) => {
                    const dateStr = new Date(entry.date + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short" });
                    if (entry.kind === "topup") {
                      const t = entry.topup;
                      const pool = pools.find((p) => p.id === t.pool_id) ?? t.pool;
                      const contributor = travelers.find((x) => x.id === t.contributed_by_id) ?? t.contributed_by;
                      return (
                        <div key={entry.key} className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3">
                          <TrendingUp size={14} className="text-emerald-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium">{contributor?.name ?? "Unknown"} → {pool?.name ?? "Pool"}</p>
                            <p className="text-xs text-slate-500">{dateStr}{t.notes ? ` · ${t.notes}` : ""}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-emerald-400">+RM {Number(t.myr_amount).toFixed(2)}</p>
                            {t.foreign_amount && <p className="text-xs text-slate-600">{trip?.foreign_currency} {Number(t.foreign_amount).toLocaleString()}</p>}
                          </div>
                        </div>
                      );
                    } else {
                      const e = entry.expense;
                      const pool = pools.find((p) => p.id === e.paid_by_id);
                      return (
                        <div key={entry.key} className="flex items-center gap-3 bg-red-950/20 border border-red-900/30 rounded-xl px-4 py-3">
                          <TrendingDown size={14} className="text-red-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium">{pool?.name ?? "Pool"} → {e.category}</p>
                            <p className="text-xs text-slate-500">{dateStr}{e.notes && e.notes !== e.category ? ` · ${e.notes}` : ""}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-red-400">-RM {Number(e.myr_amount).toFixed(2)}</p>
                            {e.foreign_amount && <p className="text-xs text-slate-600">{trip?.foreign_currency} {Number(e.foreign_amount).toLocaleString()}</p>}
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      </main>
    </>
  );
}
