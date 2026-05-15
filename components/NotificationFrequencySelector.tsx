"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, Zap, Clock, Moon } from "lucide-react";
import { useToast } from "@/components/Toaster";

// Per-trip notification frequency selector. Drops into the trip Settings
// page (or anywhere with a tripId available). Saves to
// /api/notification-preferences.
//
// Options:
//   0  Frequent  → every event = 1 push immediately (current default)
//   1  Medium    → events buffered for 1 minute, then 1 summary push
//   5  Low       → events buffered for 5 minutes, then 1 summary push
//   -1 Off       → only anomalies (high-priority alerts) come through

type Interval = -1 | 0 | 1 | 5;

const OPTIONS: { value: Interval; label: string; sub: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { value: 0,  label: "Frequent", sub: "Every event = 1 push", Icon: Zap },
  { value: 1,  label: "Medium",   sub: "1-min summary",       Icon: Clock },
  { value: 5,  label: "Low",      sub: "5-min summary",       Icon: Moon },
  { value: -1, label: "Off",      sub: "Anomalies only",      Icon: BellOff },
];

export default function NotificationFrequencySelector({ tripId }: { tripId: string }) {
  const [current, setCurrent] = useState<Interval | null>(null);
  const [saving, setSaving] = useState<Interval | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notification-preferences?trip_id=${tripId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const v = d.interval_minutes as Interval | undefined;
        setCurrent(typeof v === "number" ? v : 0);
      })
      .catch(() => {
        if (!cancelled) setCurrent(0);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  async function pick(v: Interval) {
    if (v === current || saving !== null) return;
    setSaving(v);
    try {
      const res = await fetch(`/api/notification-preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId, interval_minutes: v }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setCurrent(v);
      toast({
        kind: "success",
        title: "Notification frequency updated",
        body: OPTIONS.find((o) => o.value === v)?.label ?? "",
      });
    } catch (e) {
      toast({
        kind: "error",
        title: "Couldn't save",
        body: (e as Error).message,
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <Bell size={18} className="text-blue-400" />
        <h3 className="text-white font-semibold">Notification frequency</h3>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Anomaly alerts (duplicates, overdrafts, etc.) always come through immediately regardless of this setting.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map(({ value, label, sub, Icon }) => {
          const active = current === value;
          const busy = saving === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => pick(value)}
              disabled={current === null || saving !== null}
              className={`relative rounded-xl border px-4 py-3 text-left transition-all ${
                active
                  ? "border-blue-500 bg-blue-500/10 text-white"
                  : "border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800/80"
              } disabled:opacity-50`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={16} className={active ? "text-blue-400" : "text-slate-400"} />
                <span className="font-medium">{label}</span>
                {busy && (
                  <span className="ml-auto text-xs text-slate-500">Saving…</span>
                )}
              </div>
              <div className="text-xs text-slate-400">{sub}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
