"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip, Traveler } from "@/lib/supabase";
import { NetBalance, PaymentInstruction } from "@/lib/settlement";
import { ArrowRight } from "lucide-react";

export default function SettlementPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [balances, setBalances] = useState<NetBalance[]>([]);
  const [instructions, setInstructions] = useState<PaymentInstruction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [tripRes, settleRes] = await Promise.all([
        fetch(`/api/trips/${id}`).then((r) => r.json()),
        fetch(`/api/settlement?trip_id=${id}`).then((r) => r.json()),
      ]);
      setTrip(tripRes.error ? null : tripRes);
      setBalances(settleRes.balances ?? []);
      setInstructions(settleRes.instructions ?? []);
      setLoading(false);
    }
    load();
  }, [id]);

  return (
    <>
      <Nav tripId={id} tripName={trip?.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">
          <h1 className="text-xl font-bold text-white">Settlement</h1>

          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-800 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <>
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
                        <p className="text-xs text-slate-600">paid RM {b.paid.toFixed(2)} · owed RM {b.owed.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment instructions */}
              <div>
                <h2 className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">Who Pays Who</h2>
                {instructions.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-sm">Everyone is settled up! 🎉</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {instructions.map((inst, i) => (
                      <div key={i} className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: inst.from.color }} />
                          <span className="text-sm text-white truncate">{inst.from.name}</span>
                          <ArrowRight size={14} className="text-slate-500 flex-shrink-0" />
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: inst.to.color }} />
                          <span className="text-sm text-white truncate">{inst.to.name}</span>
                        </div>
                        <span className="text-sm font-bold text-white flex-shrink-0">RM {inst.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
