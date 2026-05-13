"use client";
import { SWRConfig } from "swr";
import type { Cache } from "swr";
import { useEffect, useRef } from "react";

// Persist SWR's in-memory cache to localStorage. On the next page load (or
// the next time the user reopens the app), previously-fetched data renders
// instantly and SWR revalidates in the background. Combined with the
// realtime hook and the service worker StaleWhileRevalidate strategy, the
// app feels essentially instant after the first session.
//
// We deliberately store only the cache values keyed by string URL — keys
// that look like SWR's internal subscription bookkeeping ($req$, $err$,
// $sub$) are not useful to persist.
function localStorageProvider(initialCache: Map<string, unknown>): Cache {
  const map = new Map<string, unknown>(initialCache);

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("travelsta-swr-cache");
      if (raw) {
        const entries = JSON.parse(raw) as [string, unknown][];
        for (const [k, v] of entries) {
          if (typeof k === "string" && k.startsWith("/api/")) map.set(k, v);
        }
      }
    } catch {
      // Corrupt cache — start fresh.
    }
  }

  return map as Cache;
}

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  const cacheRef = useRef<Map<string, unknown> | null>(null);

  // Persist on every visibility change AND on beforeunload — covers tab close,
  // refresh, switching apps on mobile, etc.
  useEffect(() => {
    if (typeof window === "undefined") return;

    function persist() {
      if (!cacheRef.current) return;
      try {
        const entries: [string, unknown][] = [];
        for (const [k, v] of cacheRef.current.entries()) {
          if (typeof k !== "string" || !k.startsWith("/api/")) continue;
          // SWR cache values are `{ data, error, ... }`. Skip if the data
          // wasn't actually resolved or is too big to be worth persisting.
          const value = v as { data?: unknown };
          if (value?.data === undefined) continue;
          try {
            const json = JSON.stringify(value);
            // Skip absurdly large entries — they're a sign of paginated lists
            // that aren't worth localStorage's limited budget.
            if (json.length > 100_000) continue;
            entries.push([k, value]);
          } catch {
            // Non-JSON-serialisable; skip.
          }
        }
        localStorage.setItem("travelsta-swr-cache", JSON.stringify(entries));
      } catch {
        // localStorage might be full or disabled — degrade silently.
      }
    }

    window.addEventListener("beforeunload", persist);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") persist();
    });

    return () => {
      persist();
      window.removeEventListener("beforeunload", persist);
    };
  }, []);

  return (
    <SWRConfig
      value={{
        provider: (initial) => {
          const c = localStorageProvider(initial as Map<string, unknown>);
          cacheRef.current = c as unknown as Map<string, unknown>;
          return c;
        },
        // Keep showing the previously-loaded data while a revalidate is in
        // flight. Without this, every refresh briefly empties the page.
        keepPreviousData: true,
        // Coalesce identical requests within a 5-second window.
        dedupingInterval: 5_000,
        // Stay fresh: refetch when window regains focus or network reconnects.
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
