"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

// Sticky banner shown whenever the browser reports no network connection.
// Cached pages keep working in read-only mode; mutations will fail until back online.
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOffline(!navigator.onLine);
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-600 text-white text-xs font-medium px-3 py-1.5 flex items-center justify-center gap-2 shadow-md">
      <WifiOff size={13} />
      <span>You&apos;re offline — viewing cached data. Changes can&apos;t be saved until you reconnect.</span>
    </div>
  );
}
