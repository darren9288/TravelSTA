"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip } from "@/lib/supabase";
import CategoryPie from "@/components/charts/CategoryPie";
import DailyBar from "@/components/charts/DailyBar";
import TravelerBar from "@/components/charts/TravelerBar";

type StatsData = {
  byCategory: { name: string; amount: number; color: string }[];
  byDay: { date: string; amount: number }[];
  byTraveler: { id: string; name: string; color: string; amount: number }[];
  total: number;
};

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [tripRes, statsRes] = await Promise.all([
        fetch(`/api/trips/${id}`).then((r) => r.json()),
        fetch(`/api/stats?trip_id=${id}`).then((r) => r.json()),
      ]);
      setTrip(tripRes.error ? null : tripRes);
      setStats(statsRes.error ? null : statsRes);
      setLoading(false);
    }
    load();
  }, [id]);

  return (
    <>
      <Nav tripId={id} tripName={trip?.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Analytics</h1>
            {stats && <span className="text-sm text-slate-400">Total: RM {stats.total.toFixed(2)}</span>}
          </div>

          {loading ? (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => <div key={i} className="h-52 bg-slate-800 rounded-xl animate-pulse" />)}
            </div>
          ) : !stats ? (
            <div className="text-center py-12 text-slate-500 text-sm">No data yet</div>
          ) : (
            <>
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-slate-400 mb-3">By Category</h2>
                <CategoryPie data={stats.byCategory} />
              </div>

              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-slate-400 mb-3">Daily Spending</h2>
                <DailyBar data={stats.byDay} />
              </div>

              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-slate-400 mb-3">Per Traveler (share paid)</h2>
                <TravelerBar data={stats.byTraveler} />
              </div>

              {/* Category breakdown table */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-slate-400 mb-3">Category Breakdown</h2>
                <div className="flex flex-col gap-2">
                  {stats.byCategory.sort((a, b) => b.amount - a.amount).map((c) => (
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
