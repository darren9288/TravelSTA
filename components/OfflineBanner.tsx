"use client";
import { useEffect, useState } from "react";
import { WifiOff, Upload } from "lucide-react";
import { getCount, subscribe } from "@/lib/offline-queue";

// Sticky banner shown whenever the browser reports no network connection,
// OR when there are queued offline mutations waiting to sync.
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOffline(!navigator.onLine);
    setPending(getCount());

    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Refresh pending count whenever the queue is touched.
    const unsub = subscribe(() => setPending(getCount()));

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsub();
    };
  }, []);

  // Show banner if we're offline OR if there's still queued work to drain
  // (the latter happens briefly after a reconnect, before the watcher clears it).
  if (!offline && pending === 0) return null;

  if (offline) {
    return (
      <div className="fixed safe-top left-0 right-0 z-[100] bg-amber-600 text-white text-xs font-medium px-3 py-1.5 flex items-center justify-center gap-2 shadow-md">
        <WifiOff size={13} />
        <span>
          You&apos;re offline — viewing cached data.
          {pending > 0
            ? ` ${pending} change${pending === 1 ? "" : "s"} queued, will sync when you reconnect.`
            : " Changes will be queued and synced when you reconnect."}
        </span>
      </div>
    );
  }

  // Online but still draining queued items.
  return (
    <div className="fixed safe-top left-0 right-0 z-[100] bg-blue-600 text-white text-xs font-medium px-3 py-1.5 flex items-center justify-center gap-2 shadow-md">
      <Upload size={13} className="animate-pulse" />
      <span>Syncing {pending} offline {pending === 1 ? "change" : "changes"}…</span>
    </div>
  );
}
