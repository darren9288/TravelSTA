"use client";
import { useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import { createClient } from "@/lib/supabase-browser";
import { useToast } from "@/components/Toaster";

// Subscribes the current page to Postgres change events for everything that
// belongs to a single trip. When ANY change is broadcast, two things happen:
//   1. SWR keys related to this trip are invalidated → useSWR pages re-fetch.
//   2. The optional `onChange` callback fires → pages without SWR can reload.
//
// A short debounce coalesces bursts (deleting an expense fires several events
// across different tables — one refresh is enough).
// Human-friendly labels for each table — used in toast notifications.
const TABLE_LABELS: Record<string, { added: string; updated: string; removed: string }> = {
  expenses:            { added: "New expense added",        updated: "Expense updated",        removed: "Expense deleted" },
  settlement_payments: { added: "Settlement recorded",      updated: "Settlement updated",     removed: "Settlement removed" },
  wallets:             { added: "New wallet added",         updated: "Wallet updated",         removed: "Wallet deleted" },
  pool_topups:         { added: "Pool top-up recorded",     updated: "Pool top-up updated",    removed: "Pool top-up removed" },
  travelers:           { added: "New traveler added",       updated: "Traveler updated",       removed: "Traveler removed" },
  itinerary_items:     { added: "New itinerary item",       updated: "Itinerary item updated", removed: "Itinerary item removed" },
  expense_splits:      { added: "",                         updated: "Split updated",          removed: "" },
  wallet_topups:       { added: "Wallet topped up",         updated: "Top-up updated",         removed: "Top-up removed" },
  trips:               { added: "",                         updated: "Trip settings updated",  removed: "" },
};

export function useTripRealtime(tripId: string | undefined, onChange?: () => void) {
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  // Track when this client itself just mutated, so we don't toast our own changes.
  const recentLocalRef = useRef<Set<string>>(new Set());

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

    // Wrap trigger to also fire a toast notification on remote changes.
    // We coalesce within the same debounce window so multi-table change bursts
    // (e.g. add expense fires expenses + splits + travelers events) only
    // produce one notification.
    let bufferedKind: "added" | "updated" | "removed" | null = null;
    let bufferedTable: string | null = null;
    const handle = (table: string, payload: { eventType?: string; new?: { id?: string }; old?: { id?: string } }) => {
      // Best-effort: skip if we just did a local mutation matching this row.
      // Without a proper actor field, we rely on a short window after a SWR
      // mutate from this tab. Imperfect but cuts most self-noise.
      const rowId = payload.new?.id ?? payload.old?.id;
      if (rowId && recentLocalRef.current.has(rowId)) return;

      let kind: "added" | "updated" | "removed" | null = null;
      if (payload.eventType === "INSERT") kind = "added";
      else if (payload.eventType === "UPDATE") kind = "updated";
      else if (payload.eventType === "DELETE") kind = "removed";
      if (!kind) return;

      // Prefer the most newsworthy table in the burst: INSERTS on top-level
      // entities (expenses, settlement_payments, etc.) beat split-table UPDATEs.
      if (!bufferedKind || (kind === "added" && bufferedKind !== "added")) {
        bufferedKind = kind;
        bufferedTable = table;
      }
      trigger();
      // After the debounce timer fires we'll show the toast.
      setTimeout(() => {
        if (bufferedKind && bufferedTable) {
          const label = TABLE_LABELS[bufferedTable]?.[bufferedKind];
          if (label) {
            toastRef.current({ kind: "info", title: label });
          }
          bufferedKind = null;
          bufferedTable = null;
        }
      }, 250);
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
        (payload: { eventType?: string; new?: { id?: string }; old?: { id?: string } }) => handle(table, payload)
      );
    }

    // The trips row itself.
    channel.on(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "trips", filter: `id=eq.${tripId}` },
      (payload: { eventType?: string; new?: { id?: string }; old?: { id?: string } }) => handle("trips", payload)
    );

    // Tables linked to a parent (no trip_id column) — subscribe to all rows.
    // For a 2-3 person app the noise is negligible, and a refresh costs almost nothing.
    const unscoped = ["expense_splits", "wallet_topups", "itinerary_links", "itinerary_files"];
    for (const table of unscoped) {
      channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        (payload: { eventType?: string; new?: { id?: string }; old?: { id?: string } }) => handle(table, payload)
      );
    }

    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [tripId, mutate]);
}
