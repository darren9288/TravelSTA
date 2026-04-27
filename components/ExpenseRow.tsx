"use client";
import { Expense, Traveler, ExpenseSplit } from "@/lib/supabase";
import TravelerBadge from "./TravelerBadge";
import { Trash2, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const CAT_COLORS: Record<string, string> = {
  "Breakfast": "#f97316", "Lunch": "#f97316", "Dinner": "#f97316", "Small Eat": "#f97316",
  "Hotel": "#6366f1", "Flight": "#3b82f6", "Transport": "#3b82f6", "Car Rental": "#3b82f6", "Fuel": "#3b82f6",
  "Activity": "#ec4899", "Entertainment": "#ec4899",
  "Souvenirs": "#a855f7", "Shopping": "#a855f7", "Supplies": "#a855f7",
  "Laundry": "#14b8a6", "Travel Related": "#14b8a6",
  "Top Up": "#22c55e", "Transfer In": "#22c55e", "Transfer Out": "#22c55e",
  "Others": "#94a3b8",
};

type Props = {
  expense: Expense;
  travelers: Traveler[];
  foreignCurrency: string;
  onDelete?: (id: string) => void;
  onEdit?: (expense: Expense) => void;
};

export default function ExpenseRow({ expense, travelers, foreignCurrency, onDelete, onEdit }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [splits, setSplits] = useState<ExpenseSplit[]>(expense.splits ?? []);
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState("");

  const color = CAT_COLORS[expense.category] ?? "#94a3b8";
  const paidBy = expense.paid_by ?? travelers.find((t) => t.id === expense.paid_by_id);

  const hasUnsettled = splits.some((s) => !s.is_settled);
  const displayNotes = expense.notes && expense.notes.trim().toLowerCase() !== expense.category.trim().toLowerCase()
    ? expense.notes : null;
  const splitsTotal = splits.reduce((s, x) => s + Number(x.amount), 0);
  const splitsMismatch = splits.length > 0 && Math.abs(splitsTotal - Number(expense.myr_amount)) > 0.05;

  async function toggleSettle(split: ExpenseSplit) {
    setToggling(split.id);
    setToggleError("");
    const newVal = !split.is_settled;
    setSplits((prev) => prev.map((s) => s.id === split.id ? { ...s, is_settled: newVal } : s));
    try {
      const res = await fetch("/api/splits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: split.id, is_settled: newVal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSplits((prev) => prev.map((s) => s.id === split.id ? { ...s, is_settled: split.is_settled } : s));
        setToggleError(data.error ?? `Save failed (${res.status})`);
      }
    } catch (e) {
      setSplits((prev) => prev.map((s) => s.id === split.id ? { ...s, is_settled: split.is_settled } : s));
      setToggleError("Network error — could not save");
    }
    setToggling(null);
  }

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${hasUnsettled ? "bg-amber-950/20 border-amber-800/40" : "bg-slate-800/60 border-slate-700/50"}`}>
      <div className="flex items-center gap-3 px-3 py-3 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: hasUnsettled ? "#f59e0b" : color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{expense.category}</span>
            {displayNotes && <span className="text-xs text-slate-500 truncate hidden sm:block">{displayNotes}</span>}
            {splitsMismatch && <span className="text-xs text-red-400 flex-shrink-0">⚠ split</span>}
            {hasUnsettled && <span className="text-xs text-amber-500 flex-shrink-0">unsettled</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {paidBy && <TravelerBadge traveler={paidBy} />}
            <span className="text-xs text-slate-500">{expense.payment_type}</span>
            {expense.split_type === "even" && <span className="text-xs text-slate-600">Even split</span>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-white">RM {Number(expense.myr_amount).toFixed(2)}</p>
          {expense.foreign_amount && (
            <p className="text-xs text-slate-500">{foreignCurrency} {Number(expense.foreign_amount).toLocaleString()}</p>
          )}
        </div>
        <div className="flex items-center gap-1 ml-1">
          {expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-700/50 px-4 py-3 bg-slate-900/30">
          {toggleError && <p className="text-xs text-red-400 mb-2">⚠ {toggleError}</p>}
          {displayNotes && <p className="text-xs text-slate-400 mb-2">📝 {displayNotes}</p>}
          {splitsMismatch && (
            <p className="text-xs text-red-400 mb-2">
              ⚠ Splits total RM {splitsTotal.toFixed(2)} ≠ expense total RM {Number(expense.myr_amount).toFixed(2)} — use Edit to fix
            </p>
          )}

          {/* Splits with settle checkboxes */}
          <div className="flex flex-col gap-1.5 mb-3">
            {splits.map((s) => {
              const t = travelers.find((x) => x.id === s.traveler_id);
              if (!t) return null;
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSettle(s); }}
                    disabled={toggling === s.id}
                    className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                      s.is_settled
                        ? "bg-emerald-500 border-emerald-500"
                        : "border-slate-500 hover:border-amber-400"
                    } ${toggling === s.id ? "opacity-50" : ""}`}
                  >
                    {s.is_settled && <span className="text-white text-xs leading-none">✓</span>}
                  </button>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                  <span className={`text-xs flex-1 ${s.is_settled ? "text-slate-500 line-through" : "text-slate-300"}`}>{t.name}</span>
                  <span className={`text-xs font-medium ${s.is_settled ? "text-slate-500" : "text-white"}`}>
                    RM {Number(s.amount).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3">
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(expense); }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-400 transition-colors"
              >
                <Pencil size={12} /> Edit
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(expense.id); }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors"
              >
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
