"use client";
import { Expense, Traveler } from "@/lib/supabase";
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
  const color = CAT_COLORS[expense.category] ?? "#94a3b8";
  const paidBy = expense.paid_by ?? travelers.find((t) => t.id === expense.paid_by_id);

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-3 py-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{expense.category}</span>
            {expense.notes && <span className="text-xs text-slate-500 truncate hidden sm:block">{expense.notes}</span>}
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
          {expense.notes && <p className="text-xs text-slate-400 mb-2">📝 {expense.notes}</p>}
          <div className="flex flex-wrap gap-2 mb-2">
            {(expense.splits ?? []).map((s) => {
              const t = travelers.find((x) => x.id === s.traveler_id);
              if (!t) return null;
              return (
                <div key={s.id} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="text-slate-400">{t.name}</span>
                  <span className="text-white font-medium">RM {Number(s.amount).toFixed(2)}</span>
                  {s.is_settled && <span className="text-emerald-400">✓</span>}
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
