"use client";
// Requires DB migration:
//   ALTER TABLE trips ADD COLUMN IF NOT EXISTS total_budget numeric;
//   ALTER TABLE trips ADD COLUMN IF NOT EXISTS per_person_budget jsonb;

import { useState } from "react";
import { Trip, Traveler } from "@/lib/supabase";
import { Target, Pencil, Check, X } from "lucide-react";

type PerPersonBudget = Record<string, number>; // traveler_id -> budget amount

type Props = {
  tripId: string;
  trip: Trip & { total_budget?: number | null; per_person_budget?: PerPersonBudget | null };
  travelers: Traveler[];
  totalSpent: number;
  spentByTraveler?: Record<string, number>; // traveler_id -> amount spent
  /** When true, hides the edit button (e.g., on dashboard for non-admins) */
  readOnly?: boolean;
  onSaved?: () => void;
};

export default function BudgetTracker({ tripId, trip, travelers, totalSpent, spentByTraveler = {}, readOnly, onSaved }: Props) {
  // Local override state — after a save we update these immediately so the
  // display reflects the new values without needing a full page reload.
  // Parent can still pass onSaved to refresh its own data layer (SWR mutate).
  const [savedTotal, setSavedTotal] = useState<number | null>(null);
  const [savedPerPerson, setSavedPerPerson] = useState<PerPersonBudget | null>(null);

  const totalBudget: number = savedTotal ?? (trip as any).total_budget ?? 0;
  const perPersonBudget: PerPersonBudget = savedPerPerson ?? (trip as any).per_person_budget ?? {};

  const [editing, setEditing] = useState(false);
  const [editTotal, setEditTotal] = useState(String(totalBudget || ""));
  const [editPerPerson, setEditPerPerson] = useState<Record<string, string>>(
    Object.fromEntries(travelers.map((t) => [t.id, String(perPersonBudget[t.id] ?? "")]))
  );
  const [saving, setSaving] = useState(false);

  if (!totalBudget && readOnly) return null;

  const pct = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;
  const over = totalBudget > 0 && totalSpent > totalBudget;

  async function save() {
    setSaving(true);
    const ppb: PerPersonBudget = {};
    for (const [tid, val] of Object.entries(editPerPerson)) {
      const n = parseFloat(val);
      if (n > 0) ppb[tid] = n;
    }
    const nextTotal = parseFloat(editTotal) || null;
    const nextPpb = Object.keys(ppb).length ? ppb : null;
    await fetch(`/api/trips/${tripId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total_budget: nextTotal,
        per_person_budget: nextPpb,
      }),
    });
    // Update local state so the display refreshes immediately — no full page reload.
    setSavedTotal(nextTotal);
    setSavedPerPerson(nextPpb ?? {});
    setSaving(false);
    setEditing(false);
    onSaved?.();
  }

  if (editing) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target size={15} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Budget Settings</h2>
          </div>
          <button onClick={() => setEditing(false)} className="text-slate-500 hover:text-white">
            <X size={15} />
          </button>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">Total Trip Budget (MYR)</label>
          <input
            type="number"
            value={editTotal}
            onChange={(e) => setEditTotal(e.target.value)}
            placeholder="e.g. 5000"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {travelers.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-400">Per-Person Budgets (optional)</label>
            {travelers.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                <span className="text-sm text-slate-300 flex-1">{t.name}</span>
                <input
                  type="number"
                  value={editPerPerson[t.id] ?? ""}
                  onChange={(e) => setEditPerPerson({ ...editPerPerson, [t.id]: e.target.value })}
                  placeholder="RM"
                  className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white text-right focus:outline-none focus:border-emerald-500"
                />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Check size={14} /> {saving ? "Saving…" : "Save Budget"}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={15} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-white">Budget</h2>
        </div>
        {!readOnly && (
          <button
            onClick={() => {
              setEditTotal(String(totalBudget || ""));
              setEditPerPerson(Object.fromEntries(travelers.map((t) => [t.id, String(perPersonBudget[t.id] ?? "")])));
              setEditing(true);
            }}
            className="p-1.5 text-slate-500 hover:text-white transition-colors"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>

      {totalBudget > 0 && (
        <>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400">
                RM {totalSpent.toFixed(0)} <span className="text-slate-600">/ RM {totalBudget.toFixed(0)}</span>
              </span>
              <span className={`text-xs font-medium ${over ? "text-red-400" : "text-emerald-400"}`}>
                {over ? `RM ${(totalSpent - totalBudget).toFixed(0)} over` : `RM ${(totalBudget - totalSpent).toFixed(0)} left`}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {Object.keys(perPersonBudget).length > 0 && travelers.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <span className="text-xs text-slate-500 uppercase tracking-wide">Per Person</span>
              {travelers.filter((t) => perPersonBudget[t.id]).map((t) => {
                const budget = perPersonBudget[t.id];
                const spent = spentByTraveler[t.id] ?? 0;
                const ppPct = Math.min((spent / budget) * 100, 100);
                const ppOver = spent > budget;
                return (
                  <div key={t.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="text-xs text-slate-300 flex-1">{t.name}</span>
                      <span className="text-xs text-slate-400">RM {spent.toFixed(0)} / RM {budget.toFixed(0)}</span>
                      <span className={`text-xs font-medium w-20 text-right ${ppOver ? "text-red-400" : "text-emerald-400"}`}>
                        {ppOver ? `RM ${(spent - budget).toFixed(0)} over` : `RM ${(budget - spent).toFixed(0)} left`}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden ml-4">
                      <div
                        className={`h-full rounded-full transition-all ${ppOver ? "bg-red-500" : ppPct > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${ppPct}%`, backgroundColor: ppOver || ppPct > 80 ? undefined : t.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {!totalBudget && (
        <p className="text-xs text-slate-500">No budget set.{" "}
          {!readOnly && (
            <button onClick={() => setEditing(true)} className="text-emerald-400 hover:text-emerald-300 underline">
              Set one
            </button>
          )}
        </p>
      )}
    </div>
  );
}
