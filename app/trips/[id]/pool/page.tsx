"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip, Traveler, PoolTopup, Expense } from "@/lib/supabase";
import { getIdentity } from "@/lib/identity";
import { Plus, RefreshCw, TrendingUp, TrendingDown, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type SortKey = "date-asc" | "date-desc" | "amount-desc" | "amount-asc";

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
  const [walletOptions, setWalletOptions] = useState<{ id: string; name: string; currency: string; traveler_id: string }[]>([]);
  const [fromWalletId, setFromWalletId] = useState("");

  // Selected pool for history
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("date-asc");
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

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
    const [tripRes, travelerRes, poolRes, walletRes] = await Promise.all([
      fetch(`/api/trips/${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/travelers?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/pool?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/wallets?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    setTrip(tripRes.error ? null : tripRes);
    const allTravelers: Traveler[] = Array.isArray(travelerRes) ? travelerRes : [];
    setTravelers(allTravelers.filter((t) => !t.is_pool));
    const poolList = allTravelers.filter((t) => t.is_pool);
    setPools(poolList);
    setTopups(Array.isArray(poolRes.topups) ? poolRes.topups : []);
    setPoolExpenses(Array.isArray(poolRes.expenses) ? poolRes.expenses : []);
    setBalances(poolRes.balances ?? {});
    setWalletOptions(walletRes.wallets ?? []);
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
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: id, pool_id: poolId, contributed_by_id: contributorId,
          myr_amount: parseFloat(myrAmount),
          foreign_amount: parseFloat(foreignAmount) || null,
          date: topupDate, notes: notes || null,
          from_wallet_id: fromWalletId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMyrAmount(""); setForeignAmount(""); setNotes(""); setShowForm(false);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  // Build pool history events for a given pool
  function buildPoolHistory(poolId: string) {
    type Event = { id: string; date: string; amount: number; sign: 1 | -1; label: string; sub: string; isForeign: boolean; foreignAmt?: number };
    const pool = pools.find((p) => p.id === poolId);
    const isForeign = pool?.pool_currency !== "MYR";
    const rate = pool?.name.toLowerCase().includes("wise") ? (trip?.wise_rate ?? 1) : (trip?.cash_rate ?? 1);

    const events: Event[] = [];
    for (const t of topups.filter((t) => t.pool_id === poolId)) {
      const amt = isForeign ? Number(t.foreign_amount ?? 0) : Number(t.myr_amount);
      events.push({ id: t.id, date: t.date, amount: amt, sign: 1, label: "Top-up", sub: t.notes ?? "", isForeign, foreignAmt: Number(t.foreign_amount ?? 0) });
    }
    for (const e of poolExpenses.filter((e) => e.paid_by_id === poolId)) {
      const amt = isForeign ? Number(e.foreign_amount ?? Number(e.myr_amount) * rate) : Number(e.myr_amount);
      events.push({ id: e.id, date: e.date, amount: amt, sign: -1, label: e.category, sub: e.notes ?? "", isForeign, foreignAmt: Number(e.foreign_amount ?? 0) });
    }
    return { events, isForeign, pool, rate };
  }

  function sortedEvents(events: ReturnType<typeof buildPoolHistory>["events"]) {
    const copy = [...events];
    if (sort === "date-asc") copy.sort((a, b) => a.date.localeCompare(b.date));
    else if (sort === "date-desc") copy.sort((a, b) => b.date.localeCompare(a.date));
    else if (sort === "amount-desc") copy.sort((a, b) => b.amount - a.amount);
    else copy.sort((a, b) => a.amount - b.amount);
    return copy;
  }

  function buildChartData(events: ReturnType<typeof buildPoolHistory>["events"]) {
    const byDate: Record<string, number> = {};
    for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
      byDate[e.date] = (byDate[e.date] ?? 0) + e.sign * e.amount;
    }
    let running = 0;
    return Object.entries(byDate).map(([date, delta]) => {
      running += delta;
      return { date: date.slice(5), balance: parseFloat(running.toFixed(0)) };
    });
  }

  function groupByDate(events: ReturnType<typeof buildPoolHistory>["events"]) {
    const map: Record<string, typeof events> = {};
    for (const e of events) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }

  function fmtDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
  }

  const selectedPoolData = selectedPool ? buildPoolHistory(selectedPool) : null;
  const selectedPoolObj = selectedPool ? pools.find((p) => p.id === selectedPool) : null;

  return (
    <>
      <Nav tripId={id} tripName={trip?.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">
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
                <select value={contributorId} onChange={(e) => { setContributorId(e.target.value); setFromWalletId(""); }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                  {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></div>
              {walletOptions.filter((w) => w.traveler_id === contributorId).length > 0 && (
                <div><label className="text-xs text-slate-400 mb-1 block">From Wallet</label>
                  <select value={fromWalletId} onChange={(e) => setFromWalletId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                    <option value="">— not linked to a wallet —</option>
                    {walletOptions.filter((w) => w.traveler_id === contributorId).map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
                    ))}
                  </select></div>
              )}
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

          {/* Main content: pool cards + history panel */}
          <div className={`flex gap-4 transition-all duration-300 ${selectedPool ? "items-start" : ""}`}>
            {/* Pool cards */}
            <div className={`flex flex-col gap-3 transition-all duration-300 ${selectedPool ? "w-2/5 min-w-0" : "w-full"}`}>
              {loading ? (
                [1, 2].map((i) => <div key={i} className="h-20 bg-slate-800 rounded-2xl animate-pulse" />)
              ) : pools.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-4">No pools set up for this trip.</p>
              ) : pools.map((p) => {
                const balMyr = balances[p.id] ?? 0;
                const isForeign = p.pool_currency !== "MYR";
                const rate = p.name.toLowerCase().includes("wise") ? (trip?.wise_rate ?? 1) : (trip?.cash_rate ?? 1);
                const balForeign = balMyr * rate;
                const positive = balMyr >= 0;
                const isSelected = selectedPool === p.id;
                return (
                  <div key={p.id} className={`bg-slate-800/60 border rounded-2xl px-4 py-3 transition-colors cursor-pointer ${isSelected ? "border-emerald-500/60 bg-slate-700/60" : "border-slate-700/50 hover:border-slate-600"}`}
                    onClick={() => setSelectedPool(isSelected ? null : p.id)}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-semibold text-sm">{p.name}</p>
                        <p className="text-xs text-slate-500">{p.pool_currency}</p>
                      </div>
                      <div className="text-right">
                        {isForeign ? (
                          <>
                            <p className={`text-lg font-bold ${positive ? "text-emerald-400" : "text-red-400"}`}>
                              {p.pool_currency} {Math.round(balForeign).toLocaleString()}
                            </p>
                            <p className="text-xs text-slate-500">RM {balMyr.toFixed(2)}</p>
                          </>
                        ) : (
                          <p className={`text-lg font-bold ${positive ? "text-emerald-400" : "text-red-400"}`}>
                            RM {balMyr.toFixed(2)}
                          </p>
                        )}
                        <p className="text-xs text-slate-600">remaining</p>
                      </div>
                    </div>
                    {!selectedPool && (
                      <p className="text-xs text-emerald-500 mt-2">Tap for history →</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* History panel */}
            {selectedPool && selectedPoolData && (
              <div className="flex-1 min-w-0 bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50">
                  <button onClick={() => setSelectedPool(null)} className="text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft size={16} />
                  </button>
                  <span className="text-sm font-semibold text-white flex-1">{selectedPoolObj?.name} History</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                    className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none">
                    <option value="date-asc">Oldest first</option>
                    <option value="date-desc">Newest first</option>
                    <option value="amount-desc">Highest amount</option>
                    <option value="amount-asc">Lowest amount</option>
                  </select>
                </div>

                {/* Chart */}
                {selectedPoolData.events.length > 0 && (() => {
                  const chartData = buildChartData(selectedPoolData.events);
                  return (
                    <div className="px-4 pt-4 pb-2">
                      <p className="text-xs text-slate-500 mb-2">Balance over time ({selectedPoolData.isForeign ? selectedPoolObj?.pool_currency : "MYR"})</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="poolGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => selectedPoolData.isForeign ? (v / 1000).toFixed(0) + "k" : v.toFixed(0)} />
                          <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#94a3b8" }} itemStyle={{ color: "#10b981" }} formatter={(v) => { const n = Number(v ?? 0); return [selectedPoolData.isForeign ? Math.round(n).toLocaleString() : `RM ${n.toFixed(2)}`, "Balance"]; }} />
                          <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2} fill="url(#poolGrad)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}

                {/* Date-grouped events */}
                <div className="flex flex-col divide-y divide-slate-700/30 max-h-96 overflow-y-auto">
                  {selectedPoolData.events.length === 0 ? (
                    <p className="text-center py-6 text-slate-600 text-sm">No history yet</p>
                  ) : (() => {
                    const sorted = sortedEvents(selectedPoolData.events);
                    if (sort === "date-asc" || sort === "date-desc") {
                      const groups = groupByDate(sorted);
                      return Object.entries(groups).map(([date, evts]) => {
                        const collapsed = collapsedDates.has(date);
                        return (
                          <div key={date}>
                            <button className="w-full flex items-center justify-between px-4 py-2 bg-slate-800/80 text-xs text-slate-400 font-medium hover:bg-slate-700/50 transition-colors"
                              onClick={() => setCollapsedDates((prev) => { const n = new Set(prev); collapsed ? n.delete(date) : n.add(date); return n; })}>
                              {fmtDate(date)}
                              {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                            </button>
                            {!collapsed && evts.map((e) => (
                              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                                {e.sign === 1
                                  ? <TrendingUp size={12} className="text-emerald-400 flex-shrink-0" />
                                  : <TrendingDown size={12} className="text-red-400 flex-shrink-0" />}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-white font-medium">{e.label}</p>
                                  {e.sub && <p className="text-xs text-slate-500 truncate">{e.sub}</p>}
                                </div>
                                <span className={`text-xs font-bold flex-shrink-0 ${e.sign === 1 ? "text-emerald-400" : "text-red-400"}`}>
                                  {e.sign === 1 ? "+" : "-"}{selectedPoolData.isForeign ? Math.round(e.amount).toLocaleString() : `RM ${e.amount.toFixed(2)}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      });
                    }
                    // Non-date sort: flat list
                    return sorted.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                        {e.sign === 1
                          ? <TrendingUp size={12} className="text-emerald-400 flex-shrink-0" />
                          : <TrendingDown size={12} className="text-red-400 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white font-medium">{e.label}</p>
                          <p className="text-xs text-slate-500">{fmtDate(e.date)}{e.sub ? ` · ${e.sub}` : ""}</p>
                        </div>
                        <span className={`text-xs font-bold flex-shrink-0 ${e.sign === 1 ? "text-emerald-400" : "text-red-400"}`}>
                          {e.sign === 1 ? "+" : "-"}{selectedPoolData.isForeign ? Math.round(e.amount).toLocaleString() : `RM ${e.amount.toFixed(2)}`}
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
