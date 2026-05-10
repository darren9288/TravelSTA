"use client";
import { useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import { createClient } from "@/lib/supabase-browser";

// Subscribes the current page to Postgres change events for everything that
// belongs to a single trip. When ANY change is broadcast, two things happen:
//   1. SWR keys related to this trip are invalidated → useSWR pages re-fetch.
//   2. The optional `onChange` callback fires → pages without SWR can reload.
//
// A short debounce coalesces bursts (deleting an expense fires several events
// across different tables — one refresh is enough).
export function useTripRealtime(tripId: string | undefined, onChange?: () => void) {
  const { mutate } = useSWRConfig();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!tripId) return;
    const supabase = createClient();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Invalidate SWR keys that mention this trip — covers all the
        // /api/<resource>?trip_id=<id> patterns plus /api/trips/<id>/...
        mutate(
          (key) =>
            typeof key === "string" &&
            (
              key.includes(`trip_id=${tripId}`) ||
              key === `/api/trips/${tripId}` ||
              key.startsWith(`/api/trips/${tripId}/`) ||
              // Settlement payments use a different param name in some places.
              key.includes(`?trip_id=${tripId}`)
            )
        );
        onChangeRef.current?.();
      }, 200);
    };

    const channel = supabase.channel(`trip-${tripId}`);

    // Tables with a direct trip_id column — narrow the subscription to this trip.
    const scoped = [
      "expenses",
      "settlement_payments",
      "wallets",
      "pool_topups",
      "travelers",
      "itinerary_items",
    ];
    for (const table of scoped) {
      channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table, filter: `trip_id=eq.${tripId}` },
        trigger
      );
    }

    // The trips row itself.
    channel.on(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "trips", filter: `id=eq.${tripId}` },
      trigger
    );

    // Tables linked to a parent (no trip_id column) — subscribe to all rows.
    // For a 2-3 person app the noise is negligible, and a refresh costs almost nothing.
    const unscoped = ["expense_splits", "wallet_topups", "itinerary_links", "itinerary_files"];
    for (const table of unscoped) {
      channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        trigger
      );
    }

    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [tripId, mutate]);
}
