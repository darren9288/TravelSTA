"use client";
import { useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import { drain, getCount, subscribe } from "@/lib/offline-queue";
import { useToast } from "@/components/Toaster";

// Mounts once in the root layout. Watches for the browser to come back
// online and automatically replays any queued offline mutations.
//
// We DON'T fire drain() on initial mount even if we're online — if the
// user has stale queued items from a previous session, we still want to
// flush them. The mount-time call covers that.
export default function OfflineQueueWatcher() {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const draining = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    async function tryDrain(reason: "online" | "mount") {
      if (draining.current) return;
      if (getCount() === 0) return;
      if (!navigator.onLine) return;
      draining.current = true;
      try {
        const { ok, failed, dropped } = await drain();
        if (ok > 0) {
          toast({
            kind: "success",
            title: `Synced ${ok} offline ${ok === 1 ? "change" : "changes"}`,
            body: reason === "online" ? "Welcome back online." : undefined,
          });
          // Force SWR to refresh everything trip-related so the freshly
          // synced expenses appear in lists.
          mutate(
            (key) => typeof key === "string" && key.startsWith("/api/"),
            undefined,
            { revalidate: true }
          );
        }
        if (dropped > 0) {
          toast({
            kind: "warning",
            title: `${dropped} offline change${dropped === 1 ? "" : "s"} couldn't be saved`,
            body: "The server rejected them. They've been removed from the queue.",
          });
        }
        if (failed > 0 && ok === 0 && dropped === 0) {
          toast({
            kind: "error",
            title: "Couldn't sync offline changes",
            body: "Will retry next time you reconnect.",
          });
        }
      } finally {
        draining.current = false;
      }
    }

    // Try on mount in case the queue carried over from a previous session.
    tryDrain("mount");

    const onOnline = () => tryDrain("online");
    window.addEventListener("online", onOnline);

    // Also subscribe to the queue itself — if a new item gets enqueued
    // while we're already online (e.g. a race during a brief glitch),
    // try to drain it immediately.
    const unsub = subscribe(() => {
      if (navigator.onLine) tryDrain("mount");
    });

    return () => {
      window.removeEventListener("online", onOnline);
      unsub();
    };
  }, [toast, mutate]);

  return null;
}
