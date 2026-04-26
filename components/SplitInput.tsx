"use client";
import { Traveler } from "@/lib/supabase";

type Split = { traveler_id: string; amount: number };

type Props = {
  travelers: Traveler[];
  splits: Split[];
  total: number;
  onChange: (splits: Split[]) => void;
};

export default function SplitInput({ travelers, splits, total, onChange }: Props) {
  const realTravelers = travelers.filter((t) => !t.is_pool);
  const splitTotal = splits.reduce((s, x) => s + (x.amount || 0), 0);
  const diff = Math.abs(splitTotal - total);
  const tally = diff < 0.01;

  function update(travelerId: string, amount: number) {
    const existing = splits.find((s) => s.traveler_id === travelerId);
    if (existing) {
      onChange(splits.map((s) => s.traveler_id === travelerId ? { ...s, amount } : s));
    } else {
      onChange([...splits, { traveler_id: travelerId, amount }]);
    }
  }

  function getAmount(travelerId: string) {
    return splits.find((s) => s.traveler_id === travelerId)?.amount ?? 0;
  }

  return (
    <div className="flex flex-col gap-2">
      {realTravelers.map((t) => (
        <div key={t.id} className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
          <span className="text-sm text-slate-300 w-24 truncate">{t.name}</span>
          <div className="flex items-center gap-1 flex-1">
            <span className="text-xs text-slate-500">RM</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={getAmount(t.id) || ""}
              onChange={(e) => update(t.id, parseFloat(e.target.value) || 0)}
              className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-500"
              placeholder="0.00"
            />
          </div>
        </div>
      ))}
      <div className={`flex justify-between text-xs px-1 mt-1 ${tally ? "text-emerald-400" : "text-red-400"}`}>
        <span>Total splits: RM {splitTotal.toFixed(2)}</span>
        <span>{tally ? "✓ Balanced" : `Difference: RM ${diff.toFixed(2)}`}</span>
      </div>
    </div>
  );
}
