"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip, Traveler } from "@/lib/supabase";
import { Plus, Wallet, Trash2, TrendingUp } from "lucide-react";

type WalletRow = {
  id: string;
  name: string;
  currency: string;
  traveler_id: string;
  traveler: { id: string; name: string; color: string };
};

type TopupRow = {
  id: string;
  wallet_id: string;
  amount: number;
  date: string;
  notes: string | null;
};

export default function WalletsPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [topups, setTopups] = useState<TopupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create wallet form
  const [showCreate, setShowCreate] = useState(false);
  const [newTravelerId, setNewTravelerId] = useState("");
  const [newName, setNewName] = useState("");
  const [newCurrency, setNewCurrency] = useState("MYR");
  const [creating, setCreating] = useState(false);

  // Top-up form
  const [topupWalletId, setTopupWalletId] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupDate, setTopupDate] = useState(new Date().toISOString().slice(0, 10));
  const [topupNotes, setTopupNotes] = useState("");
  const [topping, setTopping] = useState(false);

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
    const real = allTravelers.filter((t: Traveler) => !t.is_pool);
    setTravelers(real);
    setWallets(walletRes.wallets ?? []);
    setBalances(walletRes.balances ?? {});
    if (real.length > 0 && !newTravelerId) setNewTravelerId(real[0].id);
    if (tripData) setNewCurrency(tripData.foreign_currency ?? "MYR");

    // Fetch all topup history for all wallets
    const walletIds: string[] = (walletRes.wallets ?? []).map((w: WalletRow) => w.id);
    if (walletIds.length) {
      const allTopups: TopupRow[] = [];
      await Promise.all(walletIds.map(async (wid) => {
        const res = await fetch(`/api/wallet-topups?wallet_id=${wid}`, { cache: "no-store" }).then((r) => r.json());
        if (Array.isArray(res)) allTopups.push(...res);
      }));
      setTopups(allTopups);
    } else {
      setTopups([]);
    }
    setLoading(false);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function createWallet() {
    if (!newName.trim() || !newTravelerId) return;
    setCreating(true); setError("");
    const res = await fetch("/api/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: id, traveler_id: newTravelerId, name: newName.trim(), currency: newCurrency }),
    });
    if (res.ok) {
      setNewName(""); setShowCreate(false);
      await load();
    } else {
      const d = await res.json();
      setError(d.error);
    }
    setCreating(false);
  }

  async function deleteWallet(walletId: string) {
    if (!confirm("Delete this wallet and all its top-up history?")) return;
    await fetch("/api/wallets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: walletId }),
    });
    await load();
  }

  async function addTopup() {
    if (!topupWalletId || !topupAmount) return;
    setTopping(true); setError("");
    const res = await fetch("/api/wallet-topups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet_id: topupWalletId,
        trip_id: id,
        amount: parseFloat(topupAmount),
        date: topupDate,
        notes: topupNotes || null,
      }),
    });
    if (res.ok) {
      setTopupWalletId(null); setTopupAmount(""); setTopupNotes("");
      await load();
    } else {
      const d = await res.json();
      setError(d.error);
    }
    setTopping(false);
  }

  // Group wallets by traveler
  const byTraveler: Record<string, WalletRow[]> = {};
  for (const w of wallets) {
    if (!byTraveler[w.traveler_id]) byTraveler[w.traveler_id] = [];
    byTraveler[w.traveler_id].push(w);
  }

  const currencies = ["MYR", trip?.foreign_currency].filter(Boolean) as string[];

  return (
    <>
      <Nav tripId={id} tripName={trip?.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">
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

          {/* Wallets grouped by traveler */}
          {loading ? (
            <div className="flex flex-col gap-3">{[1, 2].map((i) => <div key={i} className="h-20 bg-slate-800 rounded-2xl animate-pulse" />)}</div>
          ) : wallets.length === 0 ? (
            <div className="text-center py-12">
              <Wallet size={32} className="text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No wallets yet. Create one to start tracking cash.</p>
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
                  const walletTopups = topups.filter((tp) => tp.wallet_id === w.id);
                  return (
                    <div key={w.id} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3">
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
                          <button onClick={() => { setTopupWalletId(w.id); setTopupAmount(""); setTopupNotes(""); }}
                            className="p-1.5 bg-emerald-700/40 hover:bg-emerald-600/60 text-emerald-400 rounded-lg transition-colors">
                            <Plus size={13} />
                          </button>
                          <button onClick={() => deleteWallet(w.id)}
                            className="p-1.5 text-slate-600 hover:text-red-400 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {walletTopups.length > 0 && (
                        <div className="border-t border-slate-700/50 px-4 py-2 flex flex-col gap-1.5">
                          {walletTopups.map((tp) => (
                            <div key={tp.id} className="flex items-center gap-2 text-xs">
                              <TrendingUp size={10} className="text-emerald-400 flex-shrink-0" />
                              <span className="text-slate-400 flex-1">{new Date(tp.date + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short" })}{tp.notes ? ` · ${tp.notes}` : ""}</span>
                              <span className="text-emerald-400 font-medium">+{w.currency === "MYR" ? Number(tp.amount).toFixed(2) : Math.round(Number(tp.amount)).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </main>
    </>
  );
}
