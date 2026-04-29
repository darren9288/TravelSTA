"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ExpenseRow from "@/components/ExpenseRow";
import { Trip, Traveler, Expense } from "@/lib/supabase";
import { PlusCircle, Banknote, BarChart2, Droplets, Settings2 } from "lucide-react";
import Link from "next/link";

export default function TripDashboard() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);

  const [wallets, setWallets] = useState<{ id: string; name: string; currency: string; traveler_id: string }[]>([]);

  const load = useCallback(async () => {
    const [tripRes, travelerRes, expenseRes, walletRes] = await Promise.all([
      fetch(`/api/trips/${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/travelers?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/expenses?trip_id=${id}&limit=5`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/wallets?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    if (tripRes.error) { router.push("/"); return; }
    setTrip(tripRes);
    setTravelers(Array.isArray(travelerRes) ? travelerRes : []);
    setExpenses(Array.isArray(expenseRes) ? expenseRes : []);
    setWallets(walletRes.wallets ?? []);
    setMyId(tripRes.my_traveler_id ?? null);
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  if (loading) return (
    <>
      <Nav />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading...</div>
      </main>
    </>
  );

  if (!trip) return null;

  const realTravelers = travelers.filter((t) => !t.is_pool);
  const me = realTravelers.find((t) => t.id === myId);
  const totalSpent = expenses.reduce((s, e) => s + Number(e.myr_amount), 0);
  const myShare = expenses
    .flatMap((e) => e.splits ?? [])
    .filter((s) => s.traveler_id === myId)
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const dateStr = trip.start_date && trip.end_date
    ? `${new Date(trip.start_date + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short" })} – ${new Date(trip.end_date + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}`
    : trip.start_date
      ? new Date(trip.start_date + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
      : null;

  return (
    <>
      <Nav tripId={id} tripName={trip.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">

          {/* Header */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-white">{trip.name}</h1>
                {trip.destination && <p className="text-slate-400 text-sm mt-0.5">📍 {trip.destination}</p>}
                {dateStr && <p className="text-slate-500 text-xs mt-1">🗓 {dateStr}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-slate-500 bg-slate-900 border border-slate-700 px-2 py-1 rounded-lg font-mono">{trip.join_code}</span>
                <span className="text-xs text-slate-600">{trip.foreign_currency} trip</span>
              </div>
            </div>
            {!myId ? (
              <button
                onClick={() => router.push(`/join/${trip.join_code}`)}
                className="mt-3 w-full py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
              >
                Join as traveler
              </button>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: me?.color ?? "#6366f1" }} />
                <span className="text-xs text-slate-400">Joined as <span className="text-white font-medium">{me?.name ?? "Unknown"}</span></span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Total Spent</p>
              <p className="text-lg font-bold text-white">RM {totalSpent.toFixed(0)}</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-3 text-center">
              <p className="text-xs text-slate-500 mb-1">My Share</p>
              <p className="text-lg font-bold text-emerald-400">RM {myShare.toFixed(0)}</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Travelers</p>
              <p className="text-lg font-bold text-white">{realTravelers.length}</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3">
            <Link href={`/trips/${id}/add`} className="flex items-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm transition-colors">
              <PlusCircle size={16} /> Add Expense
            </Link>
            <Link href={`/trips/${id}/settlement`} className="flex items-center gap-2 px-4 py-3 bg-slate-800 border border-slate-700 hover:border-slate-500 text-white rounded-xl font-medium text-sm transition-colors">
              <Banknote size={16} /> Settlement
            </Link>
            <Link href={`/trips/${id}/pool`} className="flex items-center gap-2 px-4 py-3 bg-slate-800 border border-slate-700 hover:border-slate-500 text-white rounded-xl font-medium text-sm transition-colors">
              <Droplets size={16} /> Pool
            </Link>
            <Link href={`/trips/${id}/analytics`} className="flex items-center gap-2 px-4 py-3 bg-slate-800 border border-slate-700 hover:border-slate-500 text-white rounded-xl font-medium text-sm transition-colors">
              <BarChart2 size={16} /> Analytics
            </Link>
          </div>

          {/* Travelers */}
          <div>
            <h2 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wide">Travelers</h2>
            <div className="flex flex-wrap gap-2">
              {realTravelers.map((t) => (
                <div key={t.id} className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-full px-3 py-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="text-xs text-white font-medium">{t.name}</span>
                  {t.id === myId && <span className="text-xs text-emerald-400">(me)</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Recent Expenses */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Recent Expenses</h2>
              <Link href={`/trips/${id}/expenses`} className="text-xs text-emerald-400 hover:text-emerald-300">View all</Link>
            </div>
            {expenses.length === 0 ? (
              <div className="text-center py-8 text-slate-600 text-sm">
                No expenses yet. <Link href={`/trips/${id}/add`} className="text-emerald-400 hover:text-emerald-300">Add one!</Link>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {expenses.map((e) => (
                  <ExpenseRow key={e.id} expense={e} travelers={travelers} foreignCurrency={trip.foreign_currency} wallets={wallets} />
                ))}
              </div>
            )}
          </div>

          {/* Settings link */}
          <Link href={`/trips/${id}/settings`} className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-400 transition-colors px-1">
            <Settings2 size={13} /> Trip Settings
          </Link>
        </div>
      </main>
    </>
  );
}
