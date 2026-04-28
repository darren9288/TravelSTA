"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip, Traveler } from "@/lib/supabase";
import { Plus, Trash2, TrendingUp, TrendingDown, ArrowLeft, ChevronDown, ChevronUp, Wallet } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { WalletEvent } from "@/app/api/wallet-history/route";

type WalletRow = { id: string; name: string; currency: string; traveler_id: string; traveler: { id: string; name: string; color: string } };
type SortKey = "date-asc" | "date-desc" | "amount-desc" | "amount-asc";

export default function WalletsPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [newTravelerId, setNewTravelerId] = useState("");
  const [newName, setNewName] = useState("");
  const [newCurrency, setNewCurrency] = useState("MYR");
  const [creating, setCreating] = useState(false);

  const [topupWalletId, setTopupWalletId] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupDate, setTopupDate] = useState(new Date().toISOString().slice(0, 10));
  const [topupNotes, setTopupNotes] = useState("");
  const [topping, setTopping] = useState(false);

  // History panel
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [history, setHistory] = useState<WalletEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sort, setSort] = useState<SortKey>("date-asc");
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const [tripRes, travelerRes, walletRes] = await Promise.all([
      fetch(`/api/trips/${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/travelers?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/wallets?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    const tripData = tripRes.error ? null : tripRes;
    setTrip(tripData);
    const allTravelers = Array.isArray(travelerRes) ? travelerRes : [];
    setTravelers(allTravelers.filter((t: Traveler) => !t.is_pool));
    setWallets(walletRes.wallets ?? []);
    setBalances(walletRes.balances ?? {});
    if (allTravelers.filter((t: Traveler) => !t.is_pool).length > 0 && !newTravelerId)
      setNewTravelerId(allTravelers.filter((t: Traveler) => !t.is_pool)[0].id);
    if (tripData) setNewCurrency(tripData.foreign_currency ?? "MYR");
    setLoading(false);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadHistory(walletId: string) {
    setHistoryLoading(true);
    setHistory([]);
    const res = await fetch(`/api/wallet-history?wallet_id=${walletId}&trip_id=${id}`, { cache: "no-store" }).then((r) => r.json());
    setHistory(res.events ?? []);
    setHistoryLoading(false);
  }

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (selectedWallet) loadHistory(selectedWallet);
  }, [selectedWallet]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createWallet() {
    if (!newName.trim() || !newTravelerId) return;
    setCreating(true); setError("");
    const res = await fetch("/api/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: id, traveler_id: newTravelerId, name: newName.trim(), currency: newCurrency }),
    });
    if (res.ok) { setNewName(""); setShowCreate(false); await load(); }
    else { const d = await res.json(); setError(d.error); }
    setCreating(false);
  }

  async function deleteWallet(walletId: string) {
    if (!confirm("Delete this wallet and all its top-up history?")) return;
    await fetch("/api/wallets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: walletId }) });
    if (selectedWallet === walletId) setSelectedWallet(null);
    await load();
  }

  async function addTopup() {
    if (!topupWalletId || !topupAmount) return;
    setTopping(true); setError("");
    const res = await fetch("/api/wallet-topups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_id: topupWalletId, trip_id: id, amount: parseFloat(topupAmount), date: topupDate, notes: topupNotes || null }),
    });
    if (res.ok) {
      setTopupWalletId(null); setTopupAmount(""); setTopupNotes("");
      await load();
      if (selectedWallet === topupWalletId) await loadHistory(topupWalletId);
    } else { const d = await res.json(); setError(d.error); }
    setTopping(false);
  }

  function buildChartData(events: WalletEvent[]) {
    const byDate: Record<string, number> = {};
    for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
      byDate[e.date] = (byDate[e.date] ?? 0) + e.sign * e.amount;
    }
    let running = 0;
    return Object.entries(byDate).map(([date, delta]) => {
      running += delta;
      return { date: date.slice(5), balance: parseFloat(running.toFixed(2)) };
    });
  }

  function sortedEvents(events: WalletEvent[]) {
    const copy = [...events];
    if (sort === "date-asc") copy.sort((a, b) => a.date.localeCompare(b.date));
    else if (sort === "date-desc") copy.sort((a, b) => b.date.localeCompare(a.date));
    else if (sort === "amount-desc") copy.sort((a, b) => b.amount - a.amount);
    else copy.sort((a, b) => a.amount - b.amount);
    return copy;
  }

  function groupByDate(events: WalletEvent[]) {
    const map: Record<string, WalletEvent[]> = {};
    for (const e of events) { if (!map[e.date]) map[e.date] = []; map[e.date].push(e); }
    return map;
  }

  function fmtDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
  }

  const byTraveler: Record<string, WalletRow[]> = {};
  for (const w of wallets) { if (!byTraveler[w.traveler_id]) byTraveler[w.traveler_id] = []; byTraveler[w.traveler_id].push(w); }
  const currencies = ["MYR", trip?.foreign_currency].filter(Boolean) as string[];
  const selectedWalletObj = selectedWallet ? wallets.find((w) => w.id === selectedWallet) : null;

  const typeColor: Record<WalletEvent["type"], string> = {
    topup: "text-emerald-400",
    expense: "text-red-400",
    settlement_out: "text-orange-400",
    settlement_in: "text-blue-400",
  };
  const typeLabel: Record<WalletEvent["type"], string> = {
    topup: "Top-up",
    expense: "Expense paid",
    settlement_out: "Settlement out",
    settlement_in: "Settlement in",
  };

  return (
    <>
      <Nav tripId={id} tripName={trip?.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Wallets</h1>
            <button onClick={() => setShowCreate((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors">
              <Plus size={14} /> New Wallet
            </button>
          </div>

          {/* Create wallet form */}
          {showCreate && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-white">Create Wallet</h2>
              <div><label className="text-xs text-slate-400 mb-1 block">Owner</label>
                <select value={newTravelerId} onChange={(e) => setNewTravelerId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                  {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Wallet Name</label>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Cash, Card"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Currency</label>
                  <select value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                    {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select></div>
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2 border border-slate-600 text-slate-400 text-sm rounded-xl hover:text-white transition-colors">Cancel</button>
                <button onClick={createWallet} disabled={creating || !newName.trim()}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          )}

          {/* Top-up form */}
          {topupWalletId && (() => {
            const w = wallets.find((x) => x.id === topupWalletId);
            return (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-white">Top Up — {w?.traveler?.name} · {w?.name} ({w?.currency})</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 mb-1 block">Amount ({w?.currency})</label>
                    <input type="number" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} placeholder="0.00" step="0.01"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
                  <div><label className="text-xs text-slate-400 mb-1 block">Date</label>
                    <input type="date" value={topupDate} onChange={(e) => setTopupDate(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" /></div>
                </div>
                <div><label className="text-xs text-slate-400 mb-1 block">Notes</label>
                  <input value={topupNotes} onChange={(e) => setTopupNotes(e.target.value)} placeholder="Optional"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="flex gap-2">
                  <button onClick={() => { setTopupWalletId(null); setTopupAmount(""); setTopupNotes(""); }}
                    className="flex-1 py-2 border border-slate-600 text-slate-400 text-sm rounded-xl hover:text-white transition-colors">Cancel</button>
                  <button onClick={addTopup} disabled={topping || !topupAmount}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                    {topping ? "Saving..." : "Add Top-Up"}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Wallet cards + history panel */}
          <div className={`flex gap-4 transition-all duration-300 ${selectedWallet ? "md:items-start" : ""}`}>
            {/* Wallet list — hidden on mobile when history is open */}
            <div className={`flex-col gap-3 transition-all duration-300 ${selectedWallet ? "hidden md:flex md:w-2/5 md:min-w-0" : "flex w-full"}`}>
              {loading ? (
                [1, 2].map((i) => <div key={i} className="h-20 bg-slate-800 rounded-2xl animate-pulse" />)
              ) : wallets.length === 0 ? (
                <div className="text-center py-12">
                  <Wallet size={32} className="text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No wallets yet.</p>
                </div>
              ) : (
                travelers.filter((t) => byTraveler[t.id]?.length).map((t) => (
                  <div key={t.id} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                      <span className="text-sm font-semibold text-white">{t.name}</span>
                    </div>
                    {byTraveler[t.id].map((w) => {
                      const bal = balances[w.id] ?? 0;
                      const isSelected = selectedWallet === w.id;
                      return (
                        <div key={w.id}
                          className={`bg-slate-800/60 border rounded-2xl px-4 py-3 cursor-pointer transition-colors ${isSelected ? "border-emerald-500/60 bg-slate-700/60" : "border-slate-700/50 hover:border-slate-600"}`}
                          onClick={() => setSelectedWallet(isSelected ? null : w.id)}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-white font-medium text-sm">{w.name}</p>
                              <p className="text-xs text-slate-500">{w.currency}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <p className={`text-lg font-bold ${bal >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                  {w.currency} {w.currency === "MYR" ? bal.toFixed(2) : Math.round(bal).toLocaleString()}
                                </p>
                                <p className="text-xs text-slate-600">remaining</p>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); setTopupWalletId(w.id); setTopupAmount(""); setTopupNotes(""); }}
                                className="p-1.5 bg-emerald-700/40 hover:bg-emerald-600/60 text-emerald-400 rounded-lg transition-colors">
                                <Plus size={13} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); deleteWallet(w.id); }}
                                className="p-1.5 text-slate-600 hover:text-red-400 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          {!selectedWallet && <p className="text-xs text-emerald-500 mt-1">Tap for history →</p>}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* History panel — full width on mobile, flex-1 on desktop */}
            {selectedWallet && selectedWalletObj && (
              <div className="w-full md:flex-1 md:min-w-0 bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50">
                  <button onClick={() => setSelectedWallet(null)} className="text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft size={16} />
                  </button>
                  <span className="text-sm font-semibold text-white flex-1">{selectedWalletObj.traveler?.name} · {selectedWalletObj.name}</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                    className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none">
                    <option value="date-asc">Oldest first</option>
                    <option value="date-desc">Newest first</option>
                    <option value="amount-desc">Highest amount</option>
                    <option value="amount-asc">Lowest amount</option>
                  </select>
                </div>

                {/* Chart */}
                {!historyLoading && history.length > 0 && (() => {
                  const chartData = buildChartData(history);
                  const isForeign = selectedWalletObj.currency !== "MYR";
                  return (
                    <div className="px-4 pt-4 pb-2">
                      <p className="text-xs text-slate-500 mb-2">Balance over time ({selectedWalletObj.currency})</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="walletGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => isForeign ? (v / 1000).toFixed(0) + "k" : v.toFixed(0)} />
                          <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#94a3b8" }} itemStyle={{ color: "#6366f1" }} formatter={(v) => { const n = Number(v ?? 0); return [isForeign ? Math.round(n).toLocaleString() : `RM ${n.toFixed(2)}`, "Balance"]; }} />
                          <Area type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2} fill="url(#walletGrad)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}

                {/* Events list */}
                <div className="flex flex-col divide-y divide-slate-700/30 max-h-[60vh] overflow-y-auto">
                  {historyLoading ? (
                    <div className="py-6 text-center text-slate-500 text-xs">Loading...</div>
                  ) : history.length === 0 ? (
                    <p className="text-center py-6 text-slate-600 text-sm">No history yet</p>
                  ) : (() => {
                    const sorted = sortedEvents(history);
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
                                {e.sign === 1 ? <TrendingUp size={12} className="text-emerald-400 flex-shrink-0" /> : <TrendingDown size={12} className="text-red-400 flex-shrink-0" />}
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-medium ${typeColor[e.type]}`}>{typeLabel[e.type]}</p>
                                  <p className="text-xs text-slate-500 truncate">{e.description}{e.notes && e.notes !== e.description ? ` · ${e.notes}` : ""}</p>
                                </div>
                                <span className={`text-xs font-bold flex-shrink-0 ${e.sign === 1 ? "text-emerald-400" : "text-red-400"}`}>
                                  {e.sign === 1 ? "+" : "-"}{selectedWalletObj.currency === "MYR" ? `RM ${e.amount.toFixed(2)}` : Math.round(e.amount).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      });
                    }
                    return sorted.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                        {e.sign === 1 ? <TrendingUp size={12} className="text-emerald-400 flex-shrink-0" /> : <TrendingDown size={12} className="text-red-400 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${typeColor[e.type]}`}>{typeLabel[e.type]}</p>
                          <p className="text-xs text-slate-500 truncate">{fmtDate(e.date)} · {e.description}{e.notes && e.notes !== e.description ? ` · ${e.notes}` : ""}</p>
                        </div>
                        <span className={`text-xs font-bold flex-shrink-0 ${e.sign === 1 ? "text-emerald-400" : "text-red-400"}`}>
                          {e.sign === 1 ? "+" : "-"}{selectedWalletObj.currency === "MYR" ? `RM ${e.amount.toFixed(2)}` : Math.round(e.amount).toLocaleString()}
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
