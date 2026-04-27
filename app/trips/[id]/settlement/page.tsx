"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip } from "@/lib/supabase";
import { NetBalance, PaymentInstruction } from "@/lib/settlement";
import { ArrowRight, CheckCheck, RefreshCw } from "lucide-react";

export default function SettlementPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [balances, setBalances] = useState<NetBalance[]>([]);
  const [instructions, setInstructions] = useState<PaymentInstruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState<string | null>(null);
  const [apiError, setApiError] = useState("");

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

  async function markSettled(travelerId: string) {
    setSettling(travelerId);
    await fetch("/api/splits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: id, traveler_id: travelerId }),
    });
    await load();
    setSettling(null);
  }

  return (
    <>
      <Nav tripId={id} tripName={trip?.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Settlement</h1>
            <div className="flex items-center gap-3">
              <p className="text-xs text-slate-500">Unsettled splits only</p>
              <button onClick={load} disabled={loading}
                className="flex items-center gap-1 px-2 py-1 bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-400 text-xs rounded-lg transition-colors disabled:opacity-50">
                <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          {apiError && (
            <div className="bg-red-900/30 border border-red-800/50 rounded-xl px-4 py-3">
              <p className="text-sm text-red-400 font-medium">API Error</p>
              <p className="text-xs text-red-300 mt-1">{apiError}</p>
              <p className="text-xs text-slate-500 mt-1">Check the Dev tab for details.</p>
            </div>
          )}
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-800 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <>
              {/* Who pays who — shown first as it's most actionable */}
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
                        <button
                          onClick={() => markSettled(inst.from.id)}
                          disabled={settling === inst.from.id}
                          className="flex items-center gap-1 px-2 py-1 bg-emerald-600/20 border border-emerald-700/50 hover:bg-emerald-600/40 disabled:opacity-50 text-emerald-400 text-xs rounded-lg transition-colors flex-shrink-0"
                        >
                          <CheckCheck size={12} />
                          {settling === inst.from.id ? "..." : "Paid"}
                        </button>
                      </div>
                    ))}
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
                        <p className="text-xs text-slate-600">paid RM {b.paid.toFixed(2)} · still owes RM {b.owed.toFixed(2)}</p>
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
