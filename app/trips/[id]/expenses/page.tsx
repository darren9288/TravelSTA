"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import ExpenseRow from "@/components/ExpenseRow";
import { Trip, Traveler, Expense, CATEGORIES } from "@/lib/supabase";

export default function ExpensesPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPaidBy, setFilterPaidBy] = useState("");

  useEffect(() => {
    async function load() {
      const [tripRes, travelerRes, expenseRes] = await Promise.all([
        fetch(`/api/trips/${id}`).then((r) => r.json()),
        fetch(`/api/travelers?trip_id=${id}`).then((r) => r.json()),
        fetch(`/api/expenses?trip_id=${id}`).then((r) => r.json()),
      ]);
      setTrip(tripRes.error ? null : tripRes);
      setTravelers(Array.isArray(travelerRes) ? travelerRes : []);
      setExpenses(Array.isArray(expenseRes) ? expenseRes : []);
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleDelete(expenseId: string) {
    await fetch(`/api/expenses?id=${expenseId}`, { method: "DELETE" });
    setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
  }

  const filtered = expenses.filter((e) => {
    if (filterCategory && e.category !== filterCategory) return false;
    if (filterPaidBy && e.paid_by_id !== filterPaidBy) return false;
    return true;
  });

  // Group by date
  const groups: Record<string, Expense[]> = {};
  for (const e of filtered) {
    if (!groups[e.date]) groups[e.date] = [];
    groups[e.date].push(e);
  }
  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  const total = filtered.reduce((s, e) => s + Number(e.myr_amount), 0);
  const realTravelers = travelers.filter((t) => !t.is_pool);

  return (
    <>
      <Nav tripId={id} tripName={trip?.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Expenses</h1>
            <span className="text-sm text-slate-400">RM {total.toFixed(2)}</span>
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={filterPaidBy} onChange={(e) => setFilterPaidBy(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
              <option value="">All Payers</option>
              {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {(filterCategory || filterPaidBy) && (
              <button onClick={() => { setFilterCategory(""); setFilterPaidBy(""); }}
                className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 transition-colors">
                Clear
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-800 rounded-xl animate-pulse" />)}
            </div>
          ) : sortedDates.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">No expenses found</div>
          ) : (
            sortedDates.map((date) => (
              <div key={date}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500 font-medium">
                    {new Date(date + "T00:00:00").toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <span className="text-xs text-slate-600">
                    RM {groups[date].reduce((s, e) => s + Number(e.myr_amount), 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {groups[date].map((e) => (
                    <ExpenseRow key={e.id} expense={e} travelers={travelers} foreignCurrency={trip?.foreign_currency ?? ""} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </>
  );
}
