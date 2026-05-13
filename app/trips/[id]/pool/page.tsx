"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip, Traveler, PoolTopup, Expense } from "@/lib/supabase";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useTripRealtime } from "@/lib/use-realtime";
import { Plus, RefreshCw, TrendingUp, TrendingDown, ArrowLeft, ChevronDown, ChevronUp, Pencil, Check, X, Trash2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type SortKey = "date-asc" | "date-desc" | "amount-desc" | "amount-asc";
type ContribEntry = { amount: string; walletId: string };
type EditTopup = { id: string; myrAmount: string; foreignAmount: string; date: string; notes: string; saving: boolean };

export default function PoolPage() {
  const { id } = useParams<{ id: string }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: tripData } = useSWR<Trip>(`/api/trips/${id}`, fetcher);
  const { data: travelersData } = useSWR<Traveler[]>(`/api/travelers?trip_id=${id}`, fetcher);
  const { data: poolData, isLoading: loading, mutate: mutatePool } = useSWR<{ topups: PoolTopup[]; expenses: Expense[]; balances: Record<string, number> }>(`/api/pool?trip_id=${id}`, fetcher);
  const { data: walletsData } = useSWR<{ wallets: { id: string; name: string; currency: string; traveler_id: string }[] }>(`/api/wallets?trip_id=${id}`, fetcher);

  const trip: Trip | null = tripData && !(tripData as any).error ? tripData : null;
  const allTravelers: Traveler[] = Array.isArray(travelersData) ? travelersData : [];
  const travelers: Traveler[] = allTravelers.filter((t) => !t.is_pool);
  const pools: Traveler[] = allTravelers.filter((t) => t.is_pool);
  const topups: PoolTopup[] = Array.isArray(poolData?.topups) ? poolData!.topups : [];
  const poolExpenses: Expense[] = Array.isArray(poolData?.expenses) ? poolData!.expenses : [];
  const balances: Record<string, number> = poolData?.balances ?? {};
  const myId: string | null = trip?.my_traveler_id ?? null;
  const walletOptions = walletsData?.wallets ?? [];

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

  // Rename pool
  const [renamingPoolId, setRenamingPoolId] = useState<string | null>(null);
  const [renamingPoolName, setRenamingPoolName] = useState("");
  const [savingPoolRename, setSavingPoolRename] = useState(false);

  // Create new pool wallet
  const [showCreatePool, setShowCreatePool] = useState(false);
  const [newPoolName, setNewPoolName] = useState("");
  const [newPoolCurrency, setNewPoolCurrency] = useState("MYR");
  const [creatingPool, setCreatingPool] = useState(false);

  const load = useCallback(() => {
    mutatePool();
  }, [mutatePool]); // eslint-disable-line react-hooks/exhaustive-deps

  useTripRealtime(id);

  // Look up the trip's exchange rate for a given wallet. Foreign wallets are
  // converted to MYR using cash_rate or wise_rate (or *_2 for the secondary
  // currency). Wise vs cash is decided by the wallet name containing "wise".
  const rateForWallet = useCallback(
    (wallet: { name: string; currency: string } | undefined | null): number => {
      if (!trip || !wallet || wallet.currency === "MYR") return 1;
      const isWise = wallet.name.toLowerCase().includes("wise");
      const t = trip as unknown as {
        foreign_currency?: string;
        cash_rate?: number;
        wise_rate?: number;
        foreign_currency_2?: string | null;
        cash_rate_2?: number | null;
        wise_rate_2?: number | null;
      };
      if (wallet.currency === t.foreign_currency) {
        return isWise ? Number(t.wise_rate ?? 1) : Number(t.cash_rate ?? 1);
      }
      if (t.foreign_currency_2 && wallet.currency === t.foreign_currency_2) {
        return isWise ? Number(t.wise_rate_2 ?? 1) : Number(t.cash_rate_2 ?? 1);
      }
      return 1;
    },
    [trip]
  );

  // Sync derived UI state when SWR data arrives
  useEffect(() => {
    if (travelers.length > 0) {
      setContributions((prev) => {
        const next = { ...prev };
        for (const t of travelers) if (!next[t.id]) next[t.id] = { amount: "", walletId: "" };
        return next;
      });
    }
  }, [travelers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pools.length > 0 && !poolId) setPoolId(pools[0].id);
  }, [pools.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (trip?.foreign_currency) setNewPoolCurrency(trip.foreign_currency);
  }, [trip?.foreign_currency]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleTopup() {
    const entries = travelers.filter((t) => parseFloat(contributions[t.id]?.amount) > 0);
    if (!entries.length || !poolId) { setError("Enter at least one amount."); return; }
    setSaving(true); setError("");
    try {
      await Promise.all(entries.map((t) => {
        const c = contributions[t.id];
        const wallet = walletOptions.find((w) => w.id === c.walletId);
        const entered = parseFloat(c.amount);
        // When contributing from a foreign-currency wallet, the user enters the
        // amount in that wallet's currency. We convert to MYR via the trip rate
        // and store both so the history view shows whichever the pool prefers.
        const isForeignWallet = !!wallet && wallet.currency !== "MYR";
        const rate = rateForWallet(wallet);
        const myr = isForeignWallet ? entered / rate : entered;
        const foreign = isForeignWallet ? entered : null;
        return fetch("/api/pool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trip_id: id, pool_id: poolId, contributed_by_id: t.id,
            myr_amount: parseFloat(myr.toFixed(2)),
            foreign_amount: foreign,
            date: topupDate, notes: topupNotes || null,
            from_wallet_id: c.walletId || null,
          }),
        });
      }));
      setContributions(Object.fromEntries(travelers.map((t) => [t.id, { amount: "", walletId: "" }])));
      setTopupNotes(""); setShowForm(false);
      mutatePool();
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
    if (res.ok) { setEditTopup(null); mutatePool(); }
    else { setEditTopup((p) => p ? { ...p, saving: false } : p); }
  }

  async function deletePool(poolId: string, poolName: string) {
    if (!confirm(`Delete pool "${poolName}" and all its history? This cannot be undone.`)) return;
    const res = await fetch("/api/travelers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: poolId }) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Failed to delete pool (${res.status})`);
      return;
    }
    setError("");
    if (selectedPool === poolId) setSelectedPool(null);
    mutatePool();
  }

  async function saveRenamePool() {
    if (!renamingPoolId || !renamingPoolName.trim()) return;
    setSavingPoolRename(true);
    const res = await fetch("/api/travelers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: renamingPoolId, name: renamingPoolName.trim() }),
    });
    if (res.ok) { setRenamingPoolId(null); mutatePool(); }
    setSavingPoolRename(false);
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
      mutatePool();
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
  // Sum of contributions converted to MYR — needed because each row may be in
  // a different currency (e.g. one traveler tops up from a JPY wallet while
  // another contributes from an MYR wallet).
  const totalContribMyr = travelers.reduce((s, t) => {
    const c = contributions[t.id];
    if (!c) return s;
    const wallet = walletOptions.find((w) => w.id === c.walletId);
    const entered = parseFloat(c.amount) || 0;
    if (!wallet || wallet.currency === "MYR") return s + entered;
    const rate = rateForWallet(wallet);
    return s + (rate ? entered / rate : 0);
  }, 0);

  function renderEvent(e: ReturnType<typeof buildPoolHistory>["events"][0], showDate = false) {
    const isEditing = editTopup?.id === e.id;
    if (isEditing && editTopup) {
      // If this top-up came from a foreign-currency wallet, show both inputs
      // so the user can correct either the foreign or MYR amount.
      const editingTopup = topups.find((tp) => tp.id === editTopup.id) as (typeof topups)[number] & { from_wallet_id?: string | null };
      const editingWallet = editingTopup?.from_wallet_id ? walletOptions.find((w) => w.id === editingTopup.from_wallet_id) : undefined;
      const hasForeign = !!editingWallet && editingWallet.currency !== "MYR";
      const editingRate = rateForWallet(editingWallet);
      return (
        <div key={e.id} className="px-4 py-2.5 bg-slate-700/40 flex flex-col gap-2">
          <div className={`grid gap-2 ${hasForeign ? "grid-cols-3" : "grid-cols-2"}`}>
            {hasForeign && (
              <div>
                <label className="text-xs text-slate-500 mb-0.5 block">{editingWallet?.currency} Amount</label>
                <input type="number" value={editTopup.foreignAmount} step="1"
                  onChange={(ev) => {
                    const foreign = ev.target.value;
                    const fNum = parseFloat(foreign);
                    const myr = isFinite(fNum) && editingRate ? (fNum / editingRate).toFixed(2) : "";
                    setEditTopup((p) => p ? { ...p, foreignAmount: foreign, myrAmount: myr } : p);
                  }}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500" />
              </div>
            )}
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
                  <span className="text-xs text-slate-500">Amount</span>
                  <span className="text-xs text-slate-500">From Wallet</span>
                </div>
                {travelers.map((t) => {
                  const c = contributions[t.id] ?? { amount: "", walletId: "" };
                  const tWallets = walletOptions.filter((w) => w.traveler_id === t.id);
                  const selectedWallet = walletOptions.find((w) => w.id === c.walletId);
                  const walletCurrency = selectedWallet?.currency ?? "MYR";
                  const isForeign = walletCurrency !== "MYR";
                  const rate = rateForWallet(selectedWallet);
                  const entered = parseFloat(c.amount) || 0;
                  const myrEquiv = isForeign && rate ? entered / rate : entered;
                  return (
                    <div key={t.id} className="grid grid-cols-3 gap-2 items-start">
                      <div className="flex items-center gap-1.5 py-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                        <span className="text-xs text-slate-300 truncate">{t.name}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <div className="relative">
                          <input type="number" value={c.amount} placeholder="0" step={isForeign ? "1" : "0.01"} min="0"
                            onChange={(e) => setContributions((prev) => ({ ...prev, [t.id]: { ...c, amount: e.target.value } }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-2 pr-12 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono pointer-events-none">
                            {walletCurrency}
                          </span>
                        </div>
                        {isForeign && entered > 0 && (
                          <span className="text-[10px] text-slate-500 px-1">
                            ≈ RM {myrEquiv.toFixed(2)} @ {rate}
                          </span>
                        )}
                      </div>
                      <select value={c.walletId}
                        onChange={(e) => setContributions((prev) => ({ ...prev, [t.id]: { ...c, walletId: e.target.value } }))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                        <option value="">— no wallet —</option>
                        {tWallets.map((w) => <option key={w.id} value={w.id}>{w.name}{w.currency !== "MYR" ? ` (${w.currency})` : ""}</option>)}
                      </select>
                    </div>
                  );
                })}
                {totalContribMyr > 0 && (
                  <p className="text-xs text-slate-500 text-right">
                    Total: <span className="text-white font-medium">RM {totalContribMyr.toFixed(2)}</span>
                  </p>
                )}
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setShowForm(false); setError(""); }} className="flex-1 py-2 border border-slate-600 text-slate-400 text-sm rounded-xl hover:text-white transition-colors">Cancel</button>
                <button onClick={handleTopup} disabled={saving || totalContrib === 0}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                  {saving ? "Saving..." : `Add Top-Up${totalContribMyr > 0 ? ` (RM ${totalContribMyr.toFixed(2)})` : ""}`}
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
                // Sum the actual foreign amounts of contributions and expenses
                // so the JPY display reflects what users really paid in, not a
                // round-trip MYR conversion at the pool's rate (which inflates
                // the number when contributions came from cash-rate wallets).
                const balForeign = isForeign
                  ? topups.filter((t) => t.pool_id === p.id).reduce(
                      (s, t) => s + (t.foreign_amount != null ? Number(t.foreign_amount) : Number(t.myr_amount) * rate),
                      0
                    )
                    - poolExpenses.filter((e) => e.paid_by_id === p.id).reduce(
                        (s, e) => s + (e.foreign_amount != null ? Number(e.foreign_amount) : Number(e.myr_amount) * rate),
                        0
                      )
                  : 0;
                const positive = balMyr >= 0;
                const isSelected = selectedPool === p.id;
                return (
                  <div key={p.id} className={`bg-slate-800/60 border rounded-2xl px-4 py-3 transition-colors cursor-pointer ${isSelected ? "border-emerald-500/60 bg-slate-700/60" : "border-slate-700/50 hover:border-slate-600"}`}
                    onClick={() => renamingPoolId === p.id ? undefined : setSelectedPool(isSelected ? null : p.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {renamingPoolId === p.id ? (
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <input autoFocus value={renamingPoolName} onChange={(e) => setRenamingPoolName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveRenamePool(); if (e.key === "Escape") setRenamingPoolId(null); }}
                              className="flex-1 bg-slate-700 border border-emerald-500/60 rounded px-2 py-0.5 text-sm text-white focus:outline-none" />
                            <button onClick={saveRenamePool} disabled={savingPoolRename} className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors"><Check size={13} /></button>
                            <button onClick={() => setRenamingPoolId(null)} className="p-1 text-slate-500 hover:text-white transition-colors"><X size={13} /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group/name">
                            <p className="text-white font-semibold text-sm truncate">{p.name}</p>
                            {trip?.my_role !== "viewer" && (
                              <button onClick={(e) => { e.stopPropagation(); setRenamingPoolId(p.id); setRenamingPoolName(p.name); }}
                                className="opacity-0 group-hover/name:opacity-100 p-0.5 text-slate-600 hover:text-slate-300 transition-all flex-shrink-0">
                                <Pencil size={10} />
                              </button>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-slate-500">{p.pool_currency}</p>
                      </div>
                      <div className="flex items-center gap-2">
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
                      {trip?.my_role !== "viewer" && (
                        <button onClick={(e) => { e.stopPropagation(); deletePool(p.id, p.name); }}
                          className="p-1.5 text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                          <Trash2 size={13} />
                        </button>
                      )}
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
