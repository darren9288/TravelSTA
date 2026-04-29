"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip, Traveler, SettlementPayment } from "@/lib/supabase";
import { NetBalance, PaymentInstruction } from "@/lib/settlement";
import { ArrowRight, CheckCheck, RefreshCw, X, Undo2, CheckCircle2 } from "lucide-react";

type WalletOption = { id: string; name: string; currency: string; traveler_id: string };
type PickState = {
  inst: PaymentInstruction;
  fromWalletId: string;
  toWalletId: string;
};

export default function SettlementPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [balances, setBalances] = useState<NetBalance[]>([]);
  const [instructions, setInstructions] = useState<PaymentInstruction[]>([]);
  const [payments, setPayments] = useState<SettlementPayment[]>([]);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [apiError, setApiError] = useState("");
  const [pickState, setPickState] = useState<PickState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setApiError("");
    const [tripRes, settleRes, walletRes, travelerRes] = await Promise.all([
      fetch(`/api/trips/${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/settlement?trip_id=${id}&_t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/wallets?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/travelers?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    setTrip(tripRes.error ? null : tripRes);
    if (settleRes.error) {
      setApiError(settleRes.error);
    } else {
      setBalances(settleRes.balances ?? []);
      setInstructions(settleRes.instructions ?? []);
      setPayments(settleRes.payments ?? []);
    }
    setWallets(walletRes.wallets ?? []);
    setTravelers(Array.isArray(travelerRes) ? travelerRes.filter((t: Traveler) => !t.is_pool) : []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    router.refresh();
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load, router]);

  function openPicker(inst: PaymentInstruction) {
    const fromWallets = wallets.filter((w) => w.traveler_id === inst.from.id);
    const toWallets = wallets.filter((w) => w.traveler_id === inst.to.id);
    if (!fromWallets.length && !toWallets.length) {
      doRecordPayment(inst, undefined, undefined);
      return;
    }
    setPickState({
      inst,
      fromWalletId: fromWallets[0]?.id ?? "",
      toWalletId: toWallets[0]?.id ?? "",
    });
  }

  async function doRecordPayment(inst: PaymentInstruction, fromWalletId?: string, toWalletId?: string) {
    setPickState(null);
    const key = `${inst.from.id}-${inst.to.id}`;
    setSettling(key);
    setApiError("");
    const res = await fetch("/api/settlement-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip_id: id,
        from_traveler_id: inst.from.id,
        to_traveler_id: inst.to.id,
        amount: inst.amount,
        from_wallet_id: fromWalletId ?? null,
        to_wallet_id: toWalletId ?? null,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setApiError(d.error ?? "Failed to record payment");
    }
    await load();
    setSettling(null);
  }

  async function undoPayment(paymentId: string) {
    setUndoing(paymentId);
    setApiError("");
    const res = await fetch("/api/settlement-payments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: paymentId }),
    });
    if (!res.ok) {
      const d = await res.json();
      setApiError(d.error ?? "Failed to undo payment");
    }
    await load();
    setUndoing(null);
  }

  async function markAllSettled() {
    setMarkingAll(true);
    setApiError("");
    const res = await fetch(`/api/trips/${id}/settle-all`, { method: "POST" });
    if (!res.ok) {
      const d = await res.json();
      setApiError(d.error ?? "Failed to mark all settled");
    }
    await load();
    setMarkingAll(false);
  }

  function travelerName(tid: string) {
    return travelers.find((t) => t.id === tid)?.name ?? "?";
  }
  function travelerColor(tid: string) {
    return travelers.find((t) => t.id === tid)?.color ?? "#94a3b8";
  }
  function walletName(wid: string | null) {
    if (!wid) return null;
    return wallets.find((w) => w.id === wid)?.name ?? null;
  }

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

          {/* Wallet picker modal */}
          {pickState && (() => {
            const fromWallets = wallets.filter((w) => w.traveler_id === pickState.inst.from.id);
            const toWallets = wallets.filter((w) => w.traveler_id === pickState.inst.to.id);
            return (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4" onClick={() => setPickState(null)}>
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 w-full max-w-sm flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">Record payment via wallet?</p>
                    <button onClick={() => setPickState(null)} className="text-slate-500 hover:text-white"><X size={16} /></button>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pickState.inst.from.color }} />
                    <span>{pickState.inst.from.name}</span>
                    <ArrowRight size={14} className="text-amber-500" />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pickState.inst.to.color }} />
                    <span>{pickState.inst.to.name}</span>
                    <span className="ml-auto font-bold text-amber-400">RM {pickState.inst.amount.toFixed(2)}</span>
                  </div>
                  {fromWallets.length > 0 && (
                    <div><label className="text-xs text-slate-400 mb-1 block">{pickState.inst.from.name} pays from</label>
                      <select value={pickState.fromWalletId}
                        onChange={(e) => setPickState((p) => p ? { ...p, fromWalletId: e.target.value } : p)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                        <option value="">— no wallet —</option>
                        {fromWallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
                      </select></div>
                  )}
                  {toWallets.length > 0 && (
                    <div><label className="text-xs text-slate-400 mb-1 block">{pickState.inst.to.name} receives into</label>
                      <select value={pickState.toWalletId}
                        onChange={(e) => setPickState((p) => p ? { ...p, toWalletId: e.target.value } : p)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                        <option value="">— no wallet —</option>
                        {toWallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
                      </select></div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => doRecordPayment(pickState.inst, pickState.fromWalletId || undefined, pickState.toWalletId || undefined)}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors">
                      Paid with wallets
                    </button>
                    <button onClick={() => doRecordPayment(pickState.inst)}
                      className="flex-1 py-2.5 border border-slate-600 text-slate-400 hover:text-white text-sm rounded-xl transition-colors">
                      Paid without
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {apiError && (
            <div className="bg-red-900/30 border border-red-800/50 rounded-xl px-4 py-3">
              <p className="text-sm text-red-400 font-medium">Error</p>
              <p className="text-xs text-red-300 mt-1">{apiError}</p>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-800 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <>
              {/* Outstanding instructions */}
              <div>
                <h2 className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">Who Pays Who</h2>
                {instructions.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm flex flex-col items-center gap-3">
                    <p className="text-3xl">🎉</p>
                    <p>Everyone is settled up!</p>
                    <button
                      onClick={markAllSettled}
                      disabled={markingAll}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 border border-emerald-700/50 hover:bg-emerald-600/40 disabled:opacity-50 text-emerald-400 text-xs font-medium rounded-xl transition-colors"
                    >
                      <CheckCircle2 size={14} />
                      {markingAll ? "Marking…" : "Mark all expense splits as settled"}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {instructions.map((inst, i) => {
                      const key = `${inst.from.id}-${inst.to.id}`;
                      return (
                        <div key={i} className="flex items-center gap-3 bg-amber-950/20 border border-amber-800/40 rounded-xl px-4 py-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: inst.from.color }} />
                            <span className="text-sm text-white font-medium truncate">{inst.from.name}</span>
                            <ArrowRight size={14} className="text-amber-500 flex-shrink-0" />
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: inst.to.color }} />
                            <span className="text-sm text-white font-medium truncate">{inst.to.name}</span>
                          </div>
                          <span className="text-sm font-bold text-amber-400 flex-shrink-0">RM {inst.amount.toFixed(2)}</span>
                          <button onClick={() => openPicker(inst)} disabled={settling === key}
                            className="flex items-center gap-1 px-2 py-1 bg-emerald-600/20 border border-emerald-700/50 hover:bg-emerald-600/40 disabled:opacity-50 text-emerald-400 text-xs rounded-lg transition-colors flex-shrink-0">
                            <CheckCheck size={12} />
                            {settling === key ? "..." : "Paid"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Net balances */}
              <div>
                <h2 className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">Net Balance</h2>
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

              {/* Payment history */}
              {payments.length > 0 && (
                <div>
                  <h2 className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">Payments Recorded</h2>
                  <div className="flex flex-col gap-2">
                    {payments.map((p) => {
                      const fw = walletName(p.from_wallet_id);
                      const tw = walletName(p.to_wallet_id);
                      return (
                        <div key={p.id} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/40 rounded-xl px-4 py-2.5">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: travelerColor(p.from_traveler_id) }} />
                            <span className="text-xs text-slate-400 truncate">{travelerName(p.from_traveler_id)}</span>
                            <ArrowRight size={11} className="text-slate-600 flex-shrink-0" />
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: travelerColor(p.to_traveler_id) }} />
                            <span className="text-xs text-slate-400 truncate">{travelerName(p.to_traveler_id)}</span>
                            {(fw || tw) && (
                              <span className="text-xs text-slate-600 truncate hidden sm:block">
                                💳 {fw ?? "?"} → {tw ?? "?"}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-emerald-500 flex-shrink-0">RM {Number(p.amount).toFixed(2)}</span>
                          <button
                            onClick={() => undoPayment(p.id)}
                            disabled={undoing === p.id}
                            title="Undo this payment"
                            className="flex items-center gap-1 px-1.5 py-1 text-slate-600 hover:text-red-400 disabled:opacity-50 text-xs rounded transition-colors flex-shrink-0">
                            <Undo2 size={11} />
                            {undoing === p.id ? "..." : "Undo"}
                          </button>
                        </div>
                      );
                    })}
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
