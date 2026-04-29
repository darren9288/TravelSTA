"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip } from "@/lib/supabase";
import { NetBalance, PaymentInstruction } from "@/lib/settlement";
import { ArrowRight, RefreshCw, CheckCircle2 } from "lucide-react";

export default function SettlementPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [balances, setBalances] = useState<NetBalance[]>([]);
  const [instructions, setInstructions] = useState<PaymentInstruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [apiError, setApiError] = useState("");
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setApiError("");
    const [tripRes, settleRes] = await Promise.all([
      fetch(`/api/trips/${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/settlement?trip_id=${id}&_t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    setTrip(tripRes.error ? null : tripRes);
    if (settleRes.error) {
      setApiError(settleRes.error);
    } else {
      setBalances(settleRes.balances ?? []);
      setInstructions(settleRes.instructions ?? []);
    }
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
    const res = await fetch(`/api/trips/${id}/settle-all`, { method: "POST" });
    if (!res.ok) {
      const d = await res.json();
      setApiError(d.error ?? "Failed to settle");
    }
    await load();
    setSettling(false);
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
                    {instructions.map((inst, i) => (
                      <div key={i} className="flex items-center gap-3 bg-amber-950/20 border border-amber-800/40 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: inst.from.color }} />
                          <span className="text-sm text-white font-medium truncate">{inst.from.name}</span>
                          <ArrowRight size={14} className="text-amber-500 flex-shrink-0" />
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: inst.to.color }} />
                          <span className="text-sm text-white font-medium truncate">{inst.to.name}</span>
                        </div>
                        <span className="text-sm font-bold text-amber-400 flex-shrink-0">RM {inst.amount.toFixed(2)}</span>
                      </div>
                    ))}

                    {/* Confirm step */}
                    {!confirm ? (
                      <button
                        onClick={() => setConfirm(true)}
                        className="mt-1 w-full py-3 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors"
                      >
                        <CheckCircle2 size={16} /> Settle All — Everyone Pays Now
                      </button>
                    ) : (
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
            </>
          )}
        </div>
      </main>
    </>
  );
}
