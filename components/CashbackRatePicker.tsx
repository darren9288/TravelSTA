"use client";
import { CashbackRate, formatRateLabel } from "@/lib/cashback-rates";
import { Check, Settings2, X } from "lucide-react";
import Link from "next/link";

// Long-press sheet for switching which cashback preset the auto-fill buttons
// use. The choice is stored on the trip, so switching here changes it for
// everyone on the trip (and every auto-fill button at once).
export default function CashbackRatePicker({
  rates,
  activeId,
  tripId,
  saving,
  onPick,
  onClose,
}: {
  rates: CashbackRate[];
  activeId: string | null | undefined;
  tripId: string;
  saving?: boolean;
  onPick: (rate: CashbackRate) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/70 z-[200] flex items-end md:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-4 flex flex-col gap-3 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Cashback rate</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Applies to every auto-fill button, for everyone on this trip.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          {rates.map((r) => {
            const active = r.id === activeId;
            return (
              <button
                key={r.id}
                disabled={saving}
                onClick={() => onPick(r)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors disabled:opacity-50 ${
                  active
                    ? "bg-emerald-600/20 border-emerald-500/60"
                    : "bg-slate-800 border-slate-700 hover:border-slate-500"
                }`}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-white truncate">{r.name}</span>
                  <span className="block text-[11px] text-slate-400 tabular-nums">
                    −{r.percent}% off amount · {r.percent}% to cashback
                  </span>
                </span>
                {active && <Check size={16} className="text-emerald-400 flex-shrink-0" />}
              </button>
            );
          })}
        </div>

        <Link
          href={`/trips/${tripId}/settings`}
          className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-emerald-400 transition-colors pt-1"
        >
          <Settings2 size={12} /> Edit rates in Trip Settings
        </Link>
      </div>
    </div>
  );
}
