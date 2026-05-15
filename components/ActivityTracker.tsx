"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Listens for route changes anywhere in the app and posts a page_view
// activity log entry. Fire-and-forget — never blocks navigation.
//
// Mounted once at the root layout so it captures every navigation, not
// just trip pages. The server attaches the user agent + IP automatically.

function extractTripId(path: string | null): string | null {
  if (!path) return null;
  const m = path.match(/^\/trips\/([^/]+)/);
  return m ? m[1] : null;
}

export default function ActivityTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    // Skip the activity log endpoint itself + obvious tooling paths.
    if (pathname.startsWith("/_next") || pathname.startsWith("/api")) return;

    const tripId = extractTripId(pathname);
    fetch("/api/activity/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "page_view",
        trip_id: tripId,
        details: { path: pathname },
      }),
      // No-store: we don't want this cached by the service worker.
      cache: "no-store",
      keepalive: true,
    }).catch(() => {
      // Logging failure should never affect navigation — silently swallow.
    });
  }, [pathname]);

  return null;
}
