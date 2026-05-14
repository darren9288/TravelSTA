"use client";
import { useEffect, useRef } from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import { fetcher } from "@/lib/fetcher";
import { useToast } from "@/components/Toaster";

// Mounts inside the trip layout. Watches the trip's stats and surfaces a
// one-off toast when today's spend is dramatically higher than the
// per-day average. Idea is to act as a "you might be on a binge day"
// nudge, not a wall of nagging — fires at most once per trip per session.
export default function AnomalyWatcher() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const fired = useRef(false);

  type Stats = {
    total: number;
    byDay: { date: string; amount: number }[];
  };
  const { data } = useSWR<Stats>(id ? `/api/stats?trip_id=${id}` : null, fetcher);

  useEffect(() => {
    if (!id || !data || fired.current) return;
    if (!data.byDay || data.byDay.length < 3) return; // need at least a few days of data to call something an outlier

    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = data.byDay.find((d) => d.date === today);
    if (!todayEntry) return; // no spend today yet

    const otherDays = data.byDay.filter((d) => d.date !== today);
    if (otherDays.length < 2) return;
    const avg = otherDays.reduce((s, d) => s + d.amount, 0) / otherDays.length;
    if (avg < 10) return; // ignore tiny averages — would create noisy alerts

    if (todayEntry.amount > avg * 2.5) {
      const ratio = (todayEntry.amount / avg).toFixed(1);
      toast({
        kind: "warning",
        title: "Spending higher than usual today",
        body: `RM ${todayEntry.amount.toFixed(0)} today vs avg RM ${avg.toFixed(0)} (${ratio}× higher).`,
      });
      fired.current = true;
    }
  }, [id, data, toast]);

  return null;
}
