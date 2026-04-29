"use client";
import { Expense, Traveler, ExpenseSplit } from "@/lib/supabase";
import TravelerBadge from "./TravelerBadge";
import { Trash2, Pencil, ChevronDown, ChevronUp, Lock } from "lucide-react";
import { useState, useEffect, useRef } from "react";

const CAT_COLORS: Record<string, string> = {
  "Breakfast": "#f97316", "Lunch": "#f97316", "Dinner": "#f97316", "Small Eat": "#f97316",
  "Hotel": "#6366f1", "Flight": "#3b82f6", "Transport": "#3b82f6", "Car Rental": "#3b82f6", "Fuel": "#3b82f6",
  "Activity": "#ec4899", "Entertainment": "#ec4899",
  "Souvenirs": "#a855f7", "Shopping": "#a855f7", "Supplies": "#a855f7",
  "Laundry": "#14b8a6", "Travel Related": "#14b8a6",
  "Top Up": "#22c55e", "Transfer In": "#22c55e", "Transfer Out": "#22c55e",
  "Others": "#94a3b8",
};

type WalletOption = { id: string; name: string; currency: string; traveler_id: string };

type Props = {
  expense: Expense;
  travelers: Traveler[];
  foreignCurrency: string;
  wallets?: WalletOption[];
  onDelete?: (id: string) => void;
  onEdit?: (expense: Expense) => void;
};

// Returns true if this split is auto-settled and not a real outstanding debt
function isAutoSettled(split: ExpenseSplit, expense: Expense, travelers: Traveler[]): boolean {
  const payer = travelers.find((t) => t.id === expense.paid_by_id);
  if (payer?.is_pool) return true;
  if (split.traveler_id === expense.paid_by_id) return true;
  if (expense.split_type === "individual" && Number(split.amount) === 0) return true;
  return false;
}

export default function ExpenseRow({ expense, travelers, foreignCurrency, wallets = [], onDelete, onEdit }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [splits, setSplits] = useState<ExpenseSplit[]>(expense.splits ?? []);
  const autoSavedIds = useRef<Set<string>>(new Set());

  // Sync splits when parent re-fetches fresh data
  useEffect(() => {
    setSplits(expense.splits ?? []);
  }, [expense.splits]);

  // Auto-settle payer/pool/RM0 splits in DB if they're wrongly unsettled
  useEffect(() => {
    const toFix = (expense.splits ?? []).filter(
      (s) => isAutoSettled(s, expense, travelers) && !s.is_settled && !autoSavedIds.current.has(s.id)
    );
    if (toFix.length === 0) return;
    toFix.forEach((s) => {
      autoSavedIds.current.add(s.id);
      fetch("/api/splits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, is_settled: true }),
      });
    });
    setSplits((prev) =>
      prev.map((s) => toFix.some((f) => f.id === s.id) ? { ...s, is_settled: true } : s)
    );
  }, [expense.splits]);

  const color = CAT_COLORS[expense.category] ?? "#94a3b8";
  const paidBy = expense.paid_by ?? travelers.find((t) => t.id === expense.paid_by_id);
  const paidByPool = travelers.find((t) => t.id === expense.paid_by_id)?.is_pool ?? false;

  const hasUnsettled = splits.some((s) => !s.is_settled && !isAutoSettled(s, expense, travelers));
  const displayNotes = expense.notes && expense.notes.trim().toLowerCase() !== expense.category.trim().toLowerCase()
    ? expense.notes : null;
  const splitsTotal = splits.reduce((s, x) => s + Number(x.amount), 0);
  const splitsMismatch = splits.length > 0 && Math.abs(splitsTotal - Number(expense.myr_amount)) > 0.05;

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${hasUnsettled ? "bg-amber-950/20 border-amber-800/40" : "bg-slate-800/60 border-slate-700/50"}`}>
      <div className="flex items-center gap-3 px-3 py-3 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: hasUnsettled ? "#f59e0b" : color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{expense.category}</span>
            {displayNotes && <span className="text-xs text-slate-500 truncate hidden sm:block">{displayNotes}</span>}
            {splitsMismatch && <span className="text-xs text-red-400 flex-shrink-0">⚠ split</span>}
            {paidByPool && <span className="text-xs text-blue-400 flex-shrink-0">pool</span>}
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
          {displayNotes && <p className="text-xs text-slate-400 mb-2">📝 {displayNotes}</p>}
          {splitsMismatch && (
            <p className="text-xs text-red-400 mb-2">
              ⚠ Splits total RM {splitsTotal.toFixed(2)} ≠ expense total RM {Number(expense.myr_amount).toFixed(2)} — use Edit to fix
            </p>
          )}

          <div className="flex flex-col gap-1.5 mb-3">
            {splits.map((s) => {
              const t = travelers.find((x) => x.id === s.traveler_id);
              if (!t) return null;
              const locked = isAutoSettled(s, expense, travelers);

              const lockReason = paidByPool
                ? "pool"
                : s.traveler_id === expense.paid_by_id
                  ? "payer"
                  : "RM 0";

              return (
                <div key={s.id} className="flex items-start gap-2">
                  {/* Read-only settled indicator — settlement tab controls this */}
                  <div
                    title={locked ? `Auto-settled (${lockReason})` : s.is_settled ? "Settled via settlement tab" : "Unsettled"}
                    className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                      locked
                        ? "bg-slate-600 border-slate-600"
                        : s.is_settled
                          ? "bg-emerald-500 border-emerald-500"
                          : "border-slate-500"
                    }`}
                  >
                    {(s.is_settled || locked) && (
                      locked
                        ? <Lock size={8} className="text-slate-400" />
                        : <span className="text-white text-xs leading-none">✓</span>
                    )}
                  </div>
                  <div className="mt-1 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs ${(s.is_settled || locked) ? "text-slate-500 line-through" : "text-slate-300"}`}>
                      {t.name}
                    </span>
                    {s.is_settled && !locked && (() => {
                      const fromW = wallets.find((w) => w.id === s.from_wallet_id);
                      const toW = wallets.find((w) => w.id === s.to_wallet_id);
                      if (fromW || toW) return (
                        <p className="text-xs text-slate-500 mt-0.5">
                          💳 <span className="text-slate-400">{fromW?.name ?? "?"}</span>
                          <span className="text-slate-600"> → </span>
                          <span className="text-slate-400">{toW?.name ?? "?"}</span>
                        </p>
                      );
                      return null;
                    })()}
                    {locked && (
                      <p className="text-xs text-slate-600 italic mt-0.5">{lockReason}</p>
                    )}
                  </div>
                  <span className={`text-xs font-medium flex-shrink-0 ${(s.is_settled || locked) ? "text-slate-500" : "text-white"}`}>
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
