"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ExpenseRow from "@/components/ExpenseRow";
import { Trip, Traveler, Expense, CATEGORIES, PAYMENT_TYPES } from "@/lib/supabase";
import { X, RefreshCw } from "lucide-react";

type EditState = {
  id: string;
  date: string;
  category: string;
  notes: string;
  myr_amount: string;
  foreign_amount: string;
  paid_by_id: string;
  payment_type: string;
  split_type: string;
  splits: { traveler_id: string; amount: string }[];
};

export default function ExpensesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [wallets, setWallets] = useState<{ id: string; name: string; currency: string; traveler_id: string }[]>([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPaidBy, setFilterPaidBy] = useState("");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [tripRes, travelerRes, expenseRes, walletRes] = await Promise.all([
      fetch(`/api/trips/${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/travelers?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/expenses?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/wallets?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    setTrip(tripRes.error ? null : tripRes);
    setTravelers(Array.isArray(travelerRes) ? travelerRes : []);
    setExpenses(Array.isArray(expenseRes) ? expenseRes : []);
    setWallets(walletRes.wallets ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    router.refresh();
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load, router]);

  async function handleDelete(expenseId: string) {
    await fetch(`/api/expenses?id=${expenseId}`, { method: "DELETE" });
    setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
  }

  function openEdit(expense: Expense) {
    const realTravelers = travelers.filter((t) => !t.is_pool);
    setEditState({
      id: expense.id,
      date: expense.date,
      category: expense.category,
      notes: expense.notes ?? "",
      myr_amount: String(expense.myr_amount),
      foreign_amount: expense.foreign_amount ? String(expense.foreign_amount) : "",
      paid_by_id: expense.paid_by_id,
      payment_type: expense.payment_type,
      split_type: expense.split_type,
      splits: realTravelers.map((t) => {
        const existing = expense.splits?.find((s) => s.traveler_id === t.id);
        return { traveler_id: t.id, amount: existing ? String(existing.amount) : "" };
      }),
    });
    setEditError("");
  }

  async function handleEditSave() {
    if (!editState) return;
    if (editState.split_type === "individual") {
      const myr = parseFloat(editState.myr_amount);
      const splitsSum = editState.splits.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
      if (Math.abs(splitsSum - myr) > 0.01) {
        setEditError(`Splits (RM ${splitsSum.toFixed(2)}) must equal total (RM ${myr.toFixed(2)})`);
        return;
      }
    }
    setEditSaving(true); setEditError("");
    try {
      const realTravelers = travelers.filter((t) => !t.is_pool);
      const myr = parseFloat(editState.myr_amount);
      const splitData = editState.split_type === "even"
        ? realTravelers.map((t) => ({ traveler_id: t.id, amount: parseFloat((myr / realTravelers.length).toFixed(2)) }))
        : editState.splits.map((s) => ({ traveler_id: s.traveler_id, amount: parseFloat(s.amount) || 0 }));

      const res = await fetch("/api/expenses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editState.id,
          date: editState.date,
          category: editState.category,
          notes: editState.notes || null,
          myr_amount: myr,
          foreign_amount: parseFloat(editState.foreign_amount) || null,
          paid_by_id: editState.paid_by_id,
          payment_type: editState.payment_type,
          split_type: editState.split_type,
          splits: splitData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditState(null);
      await load();
    } catch (e) {
      setEditError((e as Error).message);
    } finally {
      setEditSaving(false);
    }
  }

  const filtered = expenses.filter((e) => {
    if (filterCategory && e.category !== filterCategory) return false;
    if (filterPaidBy && e.paid_by_id !== filterPaidBy) return false;
    return true;
  });

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
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">RM {total.toFixed(2)}</span>
              <button onClick={load} disabled={loading}
                className="flex items-center gap-1 px-2 py-1 bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-400 text-xs rounded-lg transition-colors disabled:opacity-50">
                <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

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
                className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 transition-colors">Clear</button>
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
                    <ExpenseRow key={e.id} expense={e} travelers={travelers} foreignCurrency={trip?.foreign_currency ?? ""}
                      wallets={wallets} onDelete={handleDelete} onEdit={openEdit} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Edit Modal */}
      {editState && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 flex flex-col gap-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Edit Expense</h2>
              <button onClick={() => setEditState(null)} className="text-slate-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-400 mb-1 block">Date</label>
                <input type="date" value={editState.date} onChange={(e) => setEditState({ ...editState, date: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Category</label>
                <select value={editState.category} onChange={(e) => setEditState({ ...editState, category: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select></div>
            </div>

            <div><label className="text-xs text-slate-400 mb-1 block">Paid By</label>
              <select value={editState.paid_by_id} onChange={(e) => setEditState({ ...editState, paid_by_id: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_pool ? " (Pool)" : ""}</option>)}
              </select></div>

            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-400 mb-1 block">Payment Type</label>
                <select value={editState.payment_type} onChange={(e) => setEditState({ ...editState, payment_type: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                  {PAYMENT_TYPES.map((p) => <option key={p}>{p}</option>)}
                </select></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Split</label>
                <select value={editState.split_type} onChange={(e) => setEditState({ ...editState, split_type: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                  <option value="even">Even</option>
                  <option value="individual">Individual</option>
                </select></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-400 mb-1 block">MYR Amount *</label>
                <input type="number" value={editState.myr_amount} onChange={(e) => setEditState({ ...editState, myr_amount: e.target.value })} step="0.01"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">{trip?.foreign_currency} Amount</label>
                <input type="number" value={editState.foreign_amount} onChange={(e) => setEditState({ ...editState, foreign_amount: e.target.value })} step="1"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
            </div>

            {editState.split_type === "individual" && (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400">Individual Splits (MYR)</label>
                {editState.splits.map((s, i) => {
                  const t = realTravelers.find((x) => x.id === s.traveler_id);
                  return (
                    <div key={s.traveler_id} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t?.color }} />
                      <span className="text-sm text-slate-300 flex-1">{t?.name}</span>
                      <input type="number" value={s.amount} step="0.01" placeholder="0.00"
                        onChange={(e) => setEditState({
                          ...editState,
                          splits: editState.splits.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x)
                        })}
                        className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white text-right focus:outline-none focus:border-emerald-500" />
                    </div>
                  );
                })}
              </div>
            )}

            <div><label className="text-xs text-slate-400 mb-1 block">Notes</label>
              <input value={editState.notes} onChange={(e) => setEditState({ ...editState, notes: e.target.value })} placeholder="Optional"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>

            {editError && <p className="text-sm text-red-400">{editError}</p>}
            <div className="flex gap-2">
              <button onClick={() => setEditState(null)} className="flex-1 py-2.5 border border-slate-600 text-slate-400 text-sm rounded-xl hover:text-white transition-colors">Cancel</button>
              <button onClick={handleEditSave} disabled={editSaving}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
