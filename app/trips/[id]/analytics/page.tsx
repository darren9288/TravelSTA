"use client";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip } from "@/lib/supabase";
import CategoryPie from "@/components/charts/CategoryPie";
import DailyBar from "@/components/charts/DailyBar";
import TravelerBar from "@/components/charts/TravelerBar";
import CumulativeLine from "@/components/charts/CumulativeLine";
import PerPersonSpending from "@/components/PerPersonSpending";
import CashbackReport from "@/components/CashbackReport";
import CountUp from "@/components/CountUp";
import TripWrapped from "@/components/TripWrapped";
import SuperlativesCard from "@/components/SuperlativesCard";
import { RefreshCw, Sparkles, ChevronRight } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useTripRealtime } from "@/lib/use-realtime";

type StatsData = {
  byCategory: { name: string; amount: number; color: string }[];
  byDay: { date: string; amount: number }[];
  byTraveler: { id: string; name: string; color: string; amount: number }[];
  total: number;
};

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>();

  const { data: trip } = useSWR<Trip>(`/api/trips/${id}`, fetcher);
  const { data: stats, isLoading: loading, mutate } = useSWR<StatsData>(`/api/stats?trip_id=${id}`, fetcher);

  useTripRealtime(id);

  const [wrappedOpen, setWrappedOpen] = useState(false);

  return (
    <>
      {wrappedOpen && trip && (
        <TripWrapped tripId={id} trip={trip} onClose={() => setWrappedOpen(false)} />
      )}
      <Nav tripId={id} tripName={trip?.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Analytics</h1>
            <div className="flex items-center gap-3">
              {stats && <span className="text-sm text-slate-400">Total: RM <CountUp value={stats.total} /></span>}
              <button onClick={() => mutate()} disabled={loading}
                className="flex items-center gap-1 px-2 py-1 bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-400 text-xs rounded-lg transition-colors disabled:opacity-50">
                <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => <div key={i} className="h-52 rounded-xl shimmer" />)}
            </div>
          ) : !stats ? (
            <div className="text-center py-12 text-slate-500 text-sm">No data yet</div>
          ) : (
            <>
              {/* Trip Wrapped — the story recap. Hidden on near-empty trips
                  where the cards would have nothing interesting to say. */}
              {stats.total > 0 && (
                <button
                  onClick={() => setWrappedOpen(true)}
                  className="cta-glow ripple w-full rounded-2xl px-5 py-4 flex items-center gap-3 text-left bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 transition-colors"
                >
                  <Sparkles size={22} className="text-white flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-bold text-white">Trip Wrapped</span>
                    <span className="block text-xs text-emerald-100/80">
                      Your trip as a story — tap through and share it
                    </span>
                  </span>
                  <ChevronRight size={18} className="text-white/70 flex-shrink-0" />
                </button>
              )}

              <SuperlativesCard tripId={id} />

              <div className="glass-card rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-slate-400 mb-3">By Category</h2>
                <CategoryPie data={stats.byCategory} />
              </div>

              <div className="glass-card rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-slate-400 mb-3">Daily Spending</h2>
                <DailyBar data={stats.byDay} />
              </div>

              <div className="glass-card rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-slate-400 mb-1">Cumulative Spend</h2>
                <p className="text-xs text-slate-600 mb-3">Solid line = running total · dashed = daily</p>
                <CumulativeLine data={stats.byDay} />
              </div>

              <div className="glass-card rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-slate-400 mb-3">Per Traveler (share paid)</h2>
                <TravelerBar data={stats.byTraveler} />
              </div>

              {/* Per-person drill-down: sortable, date-range filterable list of
                  each traveler's individual expense shares. */}
              <PerPersonSpending tripId={id} />

              {/* Ryt cashback tracker — read-only, computed live, never writes */}
              <CashbackReport tripId={id} />

              <div className="glass-card rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-slate-400 mb-3">Category Breakdown</h2>
                <div className="flex flex-col gap-2">
                  {[...stats.byCategory].sort((a, b) => b.amount - a.amount).map((c) => (
                    <div key={c.name} className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="text-sm text-slate-300 flex-1">{c.name}</span>
                      <span className="text-sm font-medium text-white">RM {c.amount.toFixed(2)}</span>
                      <span className="text-xs text-slate-600 w-10 text-right">
                        {stats.total > 0 ? ((c.amount / stats.total) * 100).toFixed(0) : 0}%
                      </span>
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
