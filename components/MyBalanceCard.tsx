"use client";
import useSWR from "swr";
import Link from "next/link";
import { fetcher } from "@/lib/fetcher";
import type { PaymentInstruction } from "@/lib/settlement";
import { ArrowRight, ArrowDownLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import CountUp from "@/components/CountUp";

// Personal at-a-glance: from the current settlement instructions, show who owes
// YOU and who YOU owe, plus your net. Reuses /api/settlement (same data the
// Settlement page uses) — no new endpoint.
export default function MyBalanceCard({ tripId, myTravelerId }: { tripId: string; myTravelerId: string | null }) {
  const { data } = useSWR<{ instructions: PaymentInstruction[] }>(`/api/settlement?trip_id=${tripId}`, fetcher);

  if (!myTravelerId) return null;
  if (!data) return <div className="h-20 rounded-2xl shimmer" />;

  const instructions = Array.isArray(data.instructions) ? data.instructions : [];
  const iOwe = instructions.filter((i) => i.from?.id === myTravelerId);
  const owedToMe = instructions.filter((i) => i.to?.id === myTravelerId);
  const totalOwe = iOwe.reduce((s, i) => s + i.amount, 0);
  const totalOwed = owedToMe.reduce((s, i) => s + i.amount, 0);
  const net = totalOwed - totalOwe;

  if (iOwe.length === 0 && owedToMe.length === 0) {
    return (
      <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-emerald-400">
        <CheckCircle2 size={16} /> You&apos;re all settled up.
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-400">Your balance</h2>
        <span className={`text-base font-bold glow-text ${net >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
          {net >= 0 ? "+" : "−"}RM <CountUp value={Math.abs(net)} />
        </span>
      </div>

      {owedToMe.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-emerald-500 flex items-center gap-1"><ArrowDownLeft size={11} /> Owed to you</p>
          {owedToMe.map((i, k) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className="text-slate-300 flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: i.from.color }} /><span className="truncate">{i.from.name}</span>
              </span>
              <span className="flow-wire text-emerald-500 flex-1" aria-hidden="true" />
              <span className="text-emerald-400 font-medium tabular-nums flex-shrink-0">RM {i.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {iOwe.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-amber-500 flex items-center gap-1"><ArrowUpRight size={11} /> You owe</p>
          {iOwe.map((i, k) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className="text-slate-300 flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: i.to.color }} /><span className="truncate">{i.to.name}</span>
              </span>
              <span className="flow-wire text-amber-500 flex-1" aria-hidden="true" />
              <span className="text-amber-400 font-medium tabular-nums flex-shrink-0">RM {i.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      <Link href={`/trips/${tripId}/settlement`} className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1 mt-0.5">
        Go to settlement <ArrowRight size={12} />
      </Link>
    </div>
  );
}
