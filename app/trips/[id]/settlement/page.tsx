"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip } from "@/lib/supabase";
import { NetBalance, PaymentInstruction } from "@/lib/settlement";
import { ArrowRight, RefreshCw, CheckCircle2, Wallet } from "lucide-react";
import { SettlementPayment, Traveler } from "@/lib/supabase";

type WalletSelection = {
  from_wallet_id: string | null;
  to_wallet_id: string | null;
};

export default function SettlementPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [balances, setBalances] = useState<NetBalance[]>([]);
  const [instructions, setInstructions] = useState<PaymentInstruction[]>([]);
  const [history, setHistory] = useState<SettlementPayment[]>([]);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [wallets, setWallets] = useState<{ id: string; name: string; currency: string; traveler_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [apiError, setApiError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [walletSelections, setWalletSelections] = useState<Record<number, WalletSelection>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setApiError("");
    const [tripRes, settleRes, travelerRes, historyRes, walletRes] = await Promise.all([
      fetch(`/api/trips/${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/settlement?trip_id=${id}&_t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/travelers?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/settlement-payments?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/wallets?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    setTrip(tripRes.error ? null : tripRes);
    if (settleRes.error) {
      setApiError(settleRes.error);
    } else {
      setBalances(settleRes.balances ?? []);
      setInstructions(settleRes.instructions ?? []);
    }
    setTravelers(Array.isArray(travelerRes) ? travelerRes.filter((t: Traveler) => !t.is_pool) : []);
    setHistory(historyRes.payments ?? []);
    setWallets(walletRes.wallets ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    router.refresh();
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load, router]);

  async function settleAll() {
    setConfirm(false);
    setSettling(true);
    setApiError("");
    const res = await fetch(`/api/trips/${id}/settle-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletSelections }),
    });
    if (!res.ok) {
      const d = await res.json();
      setApiError(d.error ?? "Failed to settle");
    }
    await load();
    setSettling(false);
  }

  function tName(tid: string) { return travelers.find((t) => t.id === tid)?.name ?? "?"; }
  function tColor(tid: string) { return travelers.find((t) => t.id === tid)?.color ?? "#94a3b8"; }
  function wName(wid: string | null) { return wid ? wallets.find((w) => w.id === wid)?.name ?? "?" : null; }

  // Group history payments by date (created_at date)
  const historyByDate = history.reduce((acc: Record<string, SettlementPayment[]>, p) => {
    const date = new Date(p.created_at).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
    if (!acc[date]) acc[date] = [];
    acc[date].push(p);
    return acc;
  }, {} as Record<string, SettlementPayment[]>);

  return (
    <>
      <Nav tripId={id} tripName={trip?.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Settlement</h1>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1 px-2 py-1 bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-400 text-xs rounded-lg transition-colors disabled:opacity-50">
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>

          {apiError && (
            <div className="bg-red-900/30 border border-red-800/50 rounded-xl px-4 py-3">
              <p className="text-sm text-red-400">{apiError}</p>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-800 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <>
              {/* Instructions */}
              <div>
                <h2 className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">Who Pays Who</h2>

                {instructions.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    <p className="text-3xl mb-2">🎉</p>
                    Everyone is settled up!
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {instructions.map((inst, i) => {
                      const fromWallets = wallets.filter((w) => w.traveler_id === inst.from.id);
                      const toWallets = wallets.filter((w) => w.traveler_id === inst.to.id);
                      const selection = walletSelections[i] ?? { from_wallet_id: null, to_wallet_id: null };

                      return (
                        <div key={i} className="bg-amber-950/20 border border-amber-800/40 rounded-xl px-4 py-3 flex flex-col gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: inst.from.color }} />
                              <span className="text-sm text-white font-medium truncate">{inst.from.name}</span>
                              <ArrowRight size={14} className="text-amber-500 flex-shrink-0" />
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: inst.to.color }} />
                              <span className="text-sm text-white font-medium truncate">{inst.to.name}</span>
                            </div>
                            <span className="text-sm font-bold text-amber-400 flex-shrink-0">RM {inst.amount.toFixed(2)}</span>
                          </div>

                          {/* Wallet selection */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <label className="text-slate-500 mb-1 flex items-center gap-1">
                                <Wallet size={11} /> From wallet
                              </label>
                              <select
                                value={selection.from_wallet_id ?? ""}
                                onChange={(e) => setWalletSelections({
                                  ...walletSelections,
                                  [i]: { ...selection, from_wallet_id: e.target.value || null }
                                })}
                                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500"
                              >
                                <option value="">No wallet</option>
                                {fromWallets.map((w) => (
                                  <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-slate-500 mb-1 flex items-center gap-1">
                                <Wallet size={11} /> To wallet
                              </label>
                              <select
                                value={selection.to_wallet_id ?? ""}
                                onChange={(e) => setWalletSelections({
                                  ...walletSelections,
                                  [i]: { ...selection, to_wallet_id: e.target.value || null }
                                })}
                                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500"
                              >
                                <option value="">No wallet</option>
                                {toWallets.map((w) => (
                                  <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Confirm step — hidden for viewers */}
                    {trip?.my_role !== "viewer" && !confirm ? (
                      <button
                        onClick={() => setConfirm(true)}
                        className="mt-1 w-full py-3 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors"
                      >
                        <CheckCircle2 size={16} /> Settle All — Everyone Pays Now
                      </button>
                    ) : trip?.my_role !== "viewer" && confirm ? (
                      <div className="mt-1 bg-slate-800 border border-amber-700/50 rounded-xl px-4 py-3 flex flex-col gap-3">
                        <p className="text-sm text-amber-300 font-medium">Confirm settlement?</p>
                        <p className="text-xs text-slate-400">
                          This marks all {instructions.length} payment{instructions.length > 1 ? "s" : ""} as done and settles every outstanding split. Make sure everyone has paid their share first.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={settleAll}
                            disabled={settling}
                            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
                          >
                            {settling ? "Settling…" : "Yes, confirm"}
                          </button>
                          <button
                            onClick={() => setConfirm(false)}
                            className="flex-1 py-2.5 border border-slate-600 text-slate-400 hover:text-white text-sm rounded-xl transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Net balances */}
              <div>
                <h2 className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">Net Balance (unsettled)</h2>
                <div className="flex flex-col gap-2">
                  {balances.map((b) => (
                    <div key={b.traveler.id} className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: b.traveler.color }} />
                      <span className="text-sm text-white flex-1">{b.traveler.name}</span>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${b.net > 0.005 ? "text-emerald-400" : b.net < -0.005 ? "text-red-400" : "text-slate-400"}`}>
                          {b.net > 0.005 ? "+" : ""}RM {b.net.toFixed(2)}
                        </p>
                        <p className="text-xs text-slate-600">paid RM {b.paid.toFixed(2)} · owes RM {b.owed.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Settlement history */}
              {Object.keys(historyByDate).length > 0 && (
                <div>
                  <h2 className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">Settlement History</h2>
                  <div className="flex flex-col gap-3">
                    {Object.entries(historyByDate).map(([date, payments]) => (
                      <div key={date}>
                        <p className="text-xs text-slate-600 mb-1.5">{date}</p>
                        <div className="flex flex-col gap-1.5">
                          {payments.map((p) => {
                            const fromWallet = wName(p.from_wallet_id);
                            const toWallet = wName(p.to_wallet_id);
                            return (
                              <div key={p.id} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/40 rounded-xl px-4 py-2.5">
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tColor(p.from_traveler_id) }} />
                                  <span className="text-xs text-slate-400 truncate">{tName(p.from_traveler_id)}</span>
                                  {fromWallet && <span className="text-xs text-slate-600">({fromWallet})</span>}
                                  <ArrowRight size={11} className="text-slate-600 flex-shrink-0" />
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tColor(p.to_traveler_id) }} />
                                  <span className="text-xs text-slate-400 truncate">{tName(p.to_traveler_id)}</span>
                                  {toWallet && <span className="text-xs text-slate-600">({toWallet})</span>}
                                </div>
                                <span className="text-xs font-semibold text-emerald-500 flex-shrink-0">RM {Number(p.amount).toFixed(2)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
