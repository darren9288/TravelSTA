"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, Zap, Clock, Moon, List, FileText } from "lucide-react";
import { useToast } from "@/components/Toaster";

// Per-trip notification frequency + detail-level selector. Drops into the trip
// Settings page (or anywhere with a tripId available). Saves to
// /api/notification-preferences.
//
// Frequency options:
//   0  Frequent  → every event = 1 push immediately (current default)
//   1  Medium    → events buffered for 1 minute, then 1 summary push
//   5  Low       → events buffered for 5 minutes, then 1 summary push
//   -1 Off       → only anomalies (high-priority alerts) come through
//
// Detail level (only matters when frequency is Medium or Low):
//   summary  → counts:        "2 expenses added, 3 splits settled"
//   detailed → bullet list:   "• RM 50 · Lunch\n• Darren's RM 25 share settled\n..."

type Interval = -1 | 0 | 1 | 5;
type DetailLevel = "summary" | "detailed";

const FREQ_OPTIONS: { value: Interval; label: string; sub: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { value: 0,  label: "Frequent", sub: "Every event = 1 push", Icon: Zap },
  { value: 1,  label: "Medium",   sub: "1-min summary",       Icon: Clock },
  { value: 5,  label: "Low",      sub: "5-min summary",       Icon: Moon },
  { value: -1, label: "Off",      sub: "Anomalies only",      Icon: BellOff },
];

const DETAIL_OPTIONS: { value: DetailLevel; label: string; sub: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { value: "summary",  label: "Summary",  sub: "Counts only",       Icon: List },
  { value: "detailed", label: "Detailed", sub: "List every event",  Icon: FileText },
];

export default function NotificationFrequencySelector({ tripId }: { tripId: string }) {
  const [interval, setInterval] = useState<Interval | null>(null);
  const [detail, setDetail] = useState<DetailLevel | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notification-preferences?trip_id=${tripId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const v = d.interval_minutes as Interval | undefined;
        setInterval(typeof v === "number" ? v : 1);
        const lvl = d.detail_level as DetailLevel | undefined;
        setDetail(lvl ?? "detailed");
      })
      .catch(() => {
        if (!cancelled) {
          // Match the API + DB defaults — Medium 1-min summary with Detailed bullets.
          setInterval(1);
          setDetail("detailed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  async function save(patch: { interval_minutes?: Interval; detail_level?: DetailLevel }, savingKey: string, niceLabel: string) {
    if (saving !== null) return;
    setSaving(savingKey);
    try {
      const res = await fetch(`/api/notification-preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId, ...patch }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      if (patch.interval_minutes !== undefined) setInterval(patch.interval_minutes);
      if (patch.detail_level !== undefined) setDetail(patch.detail_level);
      toast({ kind: "success", title: "Updated", body: niceLabel });
    } catch (e) {
      toast({ kind: "error", title: "Couldn't save", body: (e as Error).message });
    } finally {
      setSaving(null);
    }
  }

  const showDetailToggle = interval === 1 || interval === 5;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm p-5 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Bell size={18} className="text-blue-400" />
          <h3 className="text-white font-semibold">Notification frequency</h3>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Anomaly alerts (duplicates, overdrafts, etc.) always come through immediately regardless of this setting.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {FREQ_OPTIONS.map(({ value, label, sub, Icon }) => {
            const active = interval === value;
            const busy = saving === `int:${value}`;
            return (
              <button
                key={value}
                type="button"
                onClick={() => value !== interval && save({ interval_minutes: value }, `int:${value}`, label)}
                disabled={interval === null || saving !== null}
                className={`relative rounded-xl border px-4 py-3 text-left transition-all ${
                  active
                    ? "border-blue-500 bg-blue-500/10 text-white"
                    : "border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800/80"
                } disabled:opacity-50`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={16} className={active ? "text-blue-400" : "text-slate-400"} />
                  <span className="font-medium">{label}</span>
                  {busy && <span className="ml-auto text-xs text-slate-500">Saving…</span>}
                </div>
                <div className="text-xs text-slate-400">{sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail level — only relevant when notifications are batched (Medium/Low). */}
      {showDetailToggle && (
        <div className="pt-4 border-t border-slate-800">
          <h4 className="text-sm font-semibold text-white mb-1">Notification content</h4>
          <p className="text-xs text-slate-400 mb-3">
            When events are batched, choose how much detail you want in each notification.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DETAIL_OPTIONS.map(({ value, label, sub, Icon }) => {
              const active = detail === value;
              const busy = saving === `det:${value}`;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => value !== detail && save({ detail_level: value }, `det:${value}`, label)}
                  disabled={detail === null || saving !== null}
                  className={`relative rounded-xl border px-4 py-3 text-left transition-all ${
                    active
                      ? "border-emerald-500 bg-emerald-500/10 text-white"
                      : "border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800/80"
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={16} className={active ? "text-emerald-400" : "text-slate-400"} />
                    <span className="font-medium">{label}</span>
                    {busy && <span className="ml-auto text-xs text-slate-500">Saving…</span>}
                  </div>
                  <div className="text-xs text-slate-400">{sub}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 text-xs text-slate-500 leading-relaxed">
            {detail === "detailed" ? (
              <>Example: <span className="text-slate-300">RM 50 · Lunch</span> · <span className="text-slate-300">Darren&apos;s RM 25 share settled ✓</span></>
            ) : (
              <>Example: <span className="text-slate-300">2 expenses added · 3 splits settled</span></>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
