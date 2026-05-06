"use client";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip, Traveler, SettlementPayment } from "@/lib/supabase";
import { ArrowRight, ArrowLeft, History } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

type PaymentWithWallet = SettlementPayment & {
  from_wallet?: { name: string } | null;
  to_wallet?: { name: string } | null;
};

export default function SettlementHistoryPage() {
  const { id } = useParams<{ id: string }>();

  const { data: trip } = useSWR<Trip>(`/api/trips/${id}`, fetcher);
  const { data: travelersData } = useSWR<Traveler[]>(`/api/travelers?trip_id=${id}`, fetcher);
  const { data: historyData, isLoading } = useSWR<{ payments: PaymentWithWallet[] }>(
    `/api/settlement-payments?trip_id=${id}`,
    fetcher
  );
  const { data: walletsData } = useSWR<{ wallets: { id: string; name: string }[] }>(`/api/wallets?trip_id=${id}`, fetcher);

  const travelers: Traveler[] = Array.isArray(travelersData) ? travelersData.filter((t) => !t.is_pool) : [];
  const payments: PaymentWithWallet[] = historyData?.payments ?? [];
  const wallets = walletsData?.wallets ?? [];

  function tName(tid: string) { return travelers.find((t) => t.id === tid)?.name ?? "?"; }
  function tColor(tid: string) { return travelers.find((t) => t.id === tid)?.color ?? "#94a3b8"; }
  function wName(wid: string | null) { return wid ? wallets.find((w) => w.id === wid)?.name ?? null : null; }

  // Group by date (round = all payments inserted at roughly the same time — group by calendar date)
  type GroupedRound = { date: string; isoDate: string; payments: PaymentWithWallet[] };
  const rounds: GroupedRound[] = [];
  const seen = new Map<string, GroupedRound>();

  for (const p of payments) {
    const dayKey = new Date(p.created_at).toISOString().slice(0, 10);
    if (!seen.has(dayKey)) {
      const round: GroupedRound = {
        date: new Date(p.created_at).toLocaleDateString("en-MY", {
          weekday: "short", day: "numeric", month: "short", year: "numeric",
        }),
        isoDate: dayKey,
        payments: [],
      };
      seen.set(dayKey, round);
      rounds.push(round);
    }
    seen.get(dayKey)!.payments.push(p);
  }

  // Sort rounds newest first
  rounds.sort((a, b) => b.isoDate.localeCompare(a.isoDate));

  return (
    <>
      <Nav tripId={id} tripName={trip?.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Link href={`/trips/${id}/settlement`} className="p-1.5 text-slate-500 hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <div className="flex items-center gap-2">
              <History size={18} className="text-emerald-400" />
              <h1 className="text-xl font-bold text-white">Settlement History</h1>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-slate-800 rounded-xl animate-pulse" />)}
            </div>
          ) : rounds.length === 0 ? (
            <div className="text-center py-16 flex flex-col items-center gap-3">
              <History size={32} className="text-slate-700" />
              <p className="text-slate-500 text-sm">No settlement history yet.</p>
              <Link href={`/trips/${id}/settlement`} className="text-xs text-emerald-400 hover:text-emerald-300">
                Back to Settlement
              </Link>
            </div>
          ) : (
            rounds.map((round, ri) => (
              <div key={round.isoDate} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Round {rounds.length - ri}
                  </span>
                  <span className="text-xs text-slate-500">{round.date}</span>
                </div>

                <div className="flex flex-col gap-2">
                  {round.payments.map((p) => {
                    const fromWallet = wName(p.from_wallet_id);
                    const toWallet = wName(p.to_wallet_id);
                    return (
                      <div key={p.id} className="flex items-center gap-3 bg-slate-900/60 rounded-xl px-3 py-2.5">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tColor(p.from_traveler_id) }} />
                          <span className="text-sm text-white truncate">{tName(p.from_traveler_id)}</span>
                          {fromWallet && <span className="text-xs text-slate-500 truncate">({fromWallet})</span>}
                          <ArrowRight size={13} className="text-amber-500 flex-shrink-0 mx-0.5" />
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tColor(p.to_traveler_id) }} />
                          <span className="text-sm text-white truncate">{tName(p.to_traveler_id)}</span>
                          {toWallet && <span className="text-xs text-slate-500 truncate">({toWallet})</span>}
                        </div>
                        <span className="text-sm font-bold text-emerald-400 flex-shrink-0">
                          RM {Number(p.amount).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="text-xs text-slate-600 text-right">
                  Total: RM {round.payments.reduce((s, p) => s + Number(p.amount), 0).toFixed(2)}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </>
  );
}
