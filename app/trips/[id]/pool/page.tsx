"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip, Traveler, PoolTopup, Expense } from "@/lib/supabase";
import { Plus, RefreshCw, TrendingUp, TrendingDown, ArrowLeft, ChevronDown, ChevronUp, Pencil, Check, X } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type SortKey = "date-asc" | "date-desc" | "amount-desc" | "amount-asc";
type ContribEntry = { amount: string; walletId: string };
type EditTopup = { id: string; myrAmount: string; foreignAmount: string; date: string; notes: string; saving: boolean };

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

  // Selected pool for history
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("date-asc");
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

  // Multi-traveler top-up form
  const [showForm, setShowForm] = useState(false);
  const [poolId, setPoolId] = useState("");
  const [topupDate, setTopupDate] = useState(new Date().toISOString().slice(0, 10));
  const [topupNotes, setTopupNotes] = useState("");
  const [contributions, setContributions] = useState<Record<string, ContribEntry>>({});

  // Edit top-up
  const [editTopup, setEditTopup] = useState<EditTopup | null>(null);

  // Create new pool wallet
  const [showCreatePool, setShowCreatePool] = useState(false);
  const [newPoolName, setNewPoolName] = useState("");
  const [newPoolCurrency, setNewPoolCurrency] = useState("MYR");
  const [creatingPool, setCreatingPool] = useState(false);

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
    const me = tripRes.my_traveler_id ?? null;
    setMyId(me);
    const realTravelers = allTravelers.filter((t: Traveler) => !t.is_pool);
    setContributions(Object.fromEntries(realTravelers.map((t: Traveler) => [t.id, { amount: "", walletId: "" }])));
    setPoolId(poolList[0]?.id ?? "");
    setNewPoolCurrency(tripRes.foreign_currency ?? "MYR");
    setLoading(false);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  async function handleTopup() {
    const entries = travelers.filter((t) => parseFloat(contributions[t.id]?.amount) > 0);
    if (!entries.length || !poolId) { setError("Enter at least one amount."); return; }
    setSaving(true); setError("");
    try {
      await Promise.all(entries.map((t) =>
        fetch("/api/pool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trip_id: id, pool_id: poolId, contributed_by_id: t.id,
            myr_amount: parseFloat(contributions[t.id].amount),
            foreign_amount: null,
            date: topupDate, notes: topupNotes || null,
            from_wallet_id: contributions[t.id].walletId || null,
          }),
        })
      ));
      setContributions(Object.fromEntries(travelers.map((t) => [t.id, { amount: "", walletId: "" }])));
      setTopupNotes(""); setShowForm(false);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function saveEditTopup() {
    if (!editTopup) return;
    setEditTopup((p) => p ? { ...p, saving: true } : p);
    const res = await fetch("/api/pool", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editTopup.id,
        myr_amount: parseFloat(editTopup.myrAmount) || 0,
        foreign_amount: parseFloat(editTopup.foreignAmount) || null,
        date: editTopup.date,
        notes: editTopup.notes || null,
      }),
    });
    if (res.ok) { setEditTopup(null); await load(); }
    else { setEditTopup((p) => p ? { ...p, saving: false } : p); }
  }

  async function createPool() {
    if (!newPoolName.trim()) return;
    setCreatingPool(true); setError("");
    const res = await fetch("/api/travelers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: id, name: newPoolName.trim(), color: "#10b981", is_pool: true, pool_currency: newPoolCurrency }),
    });
    if (res.ok) {
      setNewPoolName(""); setShowCreatePool(false);
      await load();
    } else { const d = await res.json(); setError(d.error); }
    setCreatingPool(false);
  }

  // Build pool history events for a given pool
  function buildPoolHistory(poolId: string) {
    type Event = { id: string; date: string; amount: number; sign: 1 | -1; label: string; sub: string; isForeign: boolean; isTopup: boolean };
    const pool = pools.find((p) => p.id === poolId);
    const isForeign = pool?.pool_currency !== "MYR";
    const rate = pool?.name.toLowerCase().includes("wise") ? (trip?.wise_rate ?? 1) : (trip?.cash_rate ?? 1);

    const events: Event[] = [];
    for (const t of topups.filter((t) => t.pool_id === poolId)) {
      // Bug fix: use myr_amount * rate as fallback when foreign_amount is null
      const amt = isForeign ? Number(t.foreign_amount ?? (Number(t.myr_amount) * rate)) : Number(t.myr_amount);
      const contributor = (t as unknown as { contributed_by?: { name: string } }).contributed_by;
      events.push({ id: t.id, date: t.date, amount: amt, sign: 1, label: "Top-up", sub: contributor?.name ?? "", isForeign, isTopup: true });
    }
    for (const e of poolExpenses.filter((e) => e.paid_by_id === poolId)) {
      const amt = isForeign ? Number(e.foreign_amount ?? (Number(e.myr_amount) * rate)) : Number(e.myr_amount);
      events.push({ id: e.id, date: e.date, amount: amt, sign: -1, label: e.category, sub: e.notes ?? "", isForeign, isTopup: false });
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

  function openEdit(eventId: string) {
    const t = topups.find((t) => t.id === eventId);
    if (!t) return;
    setEditTopup({ id: t.id, myrAmount: String(t.myr_amount), foreignAmount: t.foreign_amount ? String(t.foreign_amount) : "", date: t.date, notes: t.notes ?? "", saving: false });
  }

  const selectedPoolData = selectedPool ? buildPoolHistory(selectedPool) : null;
  const selectedPoolObj = selectedPool ? pools.find((p) => p.id === selectedPool) : null;
  const totalContrib = travelers.reduce((s, t) => s + (parseFloat(contributions[t.id]?.amount) || 0), 0);

  function renderEvent(e: ReturnType<typeof buildPoolHistory>["events"][0], showDate = false) {
    const isEditing = editTopup?.id === e.id;
    if (isEditing && editTopup) {
      return (
        <div key={e.id} className="px-4 py-2.5 bg-slate-700/40 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-slate-500 mb-0.5 block">MYR Amount</label>
              <input type="number" value={editTopup.myrAmount} step="0.01"
                onChange={(ev) => setEditTopup((p) => p ? { ...p, myrAmount: ev.target.value } : p)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500" /></div>
            <div><label className="text-xs text-slate-500 mb-0.5 block">Date</label>
              <input type="date" value={editTopup.date}
                onChange={(ev) => setEditTopup((p) => p ? { ...p, date: ev.target.value } : p)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-emerald-500" /></div>
          </div>
          <input value={editTopup.notes} placeholder="Notes (optional)"
            onChange={(ev) => setEditTopup((p) => p ? { ...p, notes: ev.target.value } : p)}
            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500" />
          <div className="flex gap-2">
            <button onClick={saveEditTopup} disabled={editTopup.saving}
              className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded transition-colors disabled:opacity-50">
              <Check size={11} /> {editTopup.saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setEditTopup(null)} className="flex items-center gap-1 px-3 py-1 border border-slate-600 text-slate-400 text-xs rounded hover:text-white transition-colors">
              <X size={11} /> Cancel
            </button>
          </div>
        </div>
      );
    }
    return (
      <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 group">
        {e.sign === 1 ? <TrendingUp size={12} className="text-emerald-400 flex-shrink-0" /> : <TrendingDown size={12} className="text-red-400 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white font-medium">{e.label}</p>
          <p className="text-xs text-slate-500 truncate">{showDate ? `${fmtDate(e.date)} · ` : ""}{e.sub || "—"}</p>
        </div>
        <span className={`text-xs font-bold flex-shrink-0 ${e.sign === 1 ? "text-emerald-400" : "text-red-400"}`}>
          {e.sign === 1 ? "+" : "-"}{selectedPoolData?.isForeign ? `${selectedPoolObj?.pool_currency} ${Math.round(e.amount).toLocaleString()}` : `RM ${e.amount.toFixed(2)}`}
        </span>
        {e.isTopup && trip?.my_role !== "viewer" && (
          <button onClick={() => openEdit(e.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-amber-400 transition-all flex-shrink-0">
            <Pencil size={11} />
          </button>
        )}
      </div>
    );
  }

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
              {trip?.my_role !== "viewer" && (<>
                <button onClick={() => { setShowCreatePool((v) => !v); setShowForm(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors">
                  <Plus size={14} /> New Pool
                </button>
                <button onClick={() => { setShowForm((v) => !v); setShowCreatePool(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors">
                  <Plus size={14} /> Top Up
                </button>
              </>)}
            </div>
          </div>

          {/* Create pool form */}
          {showCreatePool && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-white">New Pool Wallet</h2>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Pool Name</label>
                  <input value={newPoolName} onChange={(e) => setNewPoolName(e.target.value)} placeholder="e.g. Japan Pool"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Currency</label>
                  <select value={newPoolCurrency} onChange={(e) => setNewPoolCurrency(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                    <option value="MYR">MYR</option>
                    {trip?.foreign_currency && trip.foreign_currency !== "MYR" && <option value={trip.foreign_currency}>{trip.foreign_currency}</option>}
                  </select></div>
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setShowCreatePool(false); setError(""); }} className="flex-1 py-2 border border-slate-600 text-slate-400 text-sm rounded-xl hover:text-white transition-colors">Cancel</button>
                <button onClick={createPool} disabled={creatingPool || !newPoolName.trim()}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                  {creatingPool ? "Creating..." : "Create Pool"}
                </button>
              </div>
            </div>
          )}

          {/* Multi-traveler top-up form */}
          {showForm && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-white">Pool Top-Up</h2>

              {pools.length > 1 && (
                <div><label className="text-xs text-slate-400 mb-1 block">Pool</label>
                  <select value={poolId} onChange={(e) => setPoolId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                    {pools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select></div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Date</label>
                  <input type="date" value={topupDate} onChange={(e) => setTopupDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Notes (shared)</label>
                  <input value={topupNotes} onChange={(e) => setTopupNotes(e.target.value)} placeholder="Optional"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
              </div>

              {/* Per-traveler contributions */}
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-2 px-1">
                  <span className="text-xs text-slate-500">Traveler</span>
                  <span className="text-xs text-slate-500">Amount (RM)</span>
                  <span className="text-xs text-slate-500">From Wallet</span>
                </div>
                {travelers.map((t) => {
                  const c = contributions[t.id] ?? { amount: "", walletId: "" };
                  const tWallets = walletOptions.filter((w) => w.traveler_id === t.id);
                  return (
                    <div key={t.id} className="grid grid-cols-3 gap-2 items-center">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                        <span className="text-xs text-slate-300 truncate">{t.name}</span>
                      </div>
                      <input type="number" value={c.amount} placeholder="0" step="0.01" min="0"
                        onChange={(e) => setContributions((prev) => ({ ...prev, [t.id]: { ...c, amount: e.target.value } }))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
                      <select value={c.walletId}
                        onChange={(e) => setContributions((prev) => ({ ...prev, [t.id]: { ...c, walletId: e.target.value } }))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                        <option value="">— no wallet —</option>
                        {tWallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                  );
                })}
                {totalContrib > 0 && (
                  <p className="text-xs text-slate-500 text-right">Total: <span className="text-white font-medium">RM {totalContrib.toFixed(2)}</span></p>
                )}
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setShowForm(false); setError(""); }} className="flex-1 py-2 border border-slate-600 text-slate-400 text-sm rounded-xl hover:text-white transition-colors">Cancel</button>
                <button onClick={handleTopup} disabled={saving || totalContrib === 0}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                  {saving ? "Saving..." : `Add Top-Up${totalContrib > 0 ? ` (RM ${totalContrib.toFixed(2)})` : ""}`}
                </button>
              </div>
            </div>
          )}

          {/* Main content: pool cards + history panel */}
          <div className={`flex gap-4 transition-all duration-300 ${selectedPool ? "md:items-start" : ""}`}>
            {/* Pool cards — hidden on mobile when history is open */}
            <div className={`flex-col gap-3 transition-all duration-300 ${selectedPool ? "hidden md:flex md:w-2/5 md:min-w-0" : "flex w-full"}`}>
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
                    {!selectedPool && <p className="text-xs text-emerald-500 mt-2">Tap for history →</p>}
                  </div>
                );
              })}
            </div>

            {/* History panel */}
            {selectedPool && selectedPoolData && (
              <div className="w-full md:flex-1 md:min-w-0 bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50">
                  <button onClick={() => { setSelectedPool(null); setEditTopup(null); }} className="text-slate-400 hover:text-white transition-colors">
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
                          <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#94a3b8" }} itemStyle={{ color: "#10b981" }} formatter={(v) => { const n = Number(v ?? 0); return [selectedPoolData.isForeign ? `${selectedPoolObj?.pool_currency} ${Math.round(n).toLocaleString()}` : `RM ${n.toFixed(2)}`, "Balance"]; }} />
                          <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2} fill="url(#poolGrad)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}

                <div className="flex flex-col divide-y divide-slate-700/30 max-h-[60vh] overflow-y-auto">
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
                            {!collapsed && evts.map((e) => renderEvent(e))}
                          </div>
                        );
                      });
                    }
                    return sorted.map((e) => renderEvent(e, true));
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
