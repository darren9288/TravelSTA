"use client";
import Link from "next/link";
import { WifiOff, RotateCw } from "lucide-react";

// Friendly fallback page served by next-pwa when the user is offline AND
// navigates to a page the service worker hasn't cached yet. Replaces the
// browser's default "site can't be reached" error.
//
// Pages the user HAS visited online before are served from the SW cache
// directly — this page only appears for never-seen pages.
export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-slate-950">
      <div className="max-w-sm text-center flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-amber-900/30 border border-amber-700/40 flex items-center justify-center">
          <WifiOff size={28} className="text-amber-400" />
        </div>
        <h1 className="text-xl font-bold text-white">You&apos;re offline</h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          This page hasn&apos;t been cached yet. Pages you&apos;ve already visited
          while online will still work — try one of those, or reconnect and reload.
        </p>
        <div className="flex flex-col gap-2 w-full mt-2">
          <button
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <RotateCw size={14} /> Try again
          </button>
          <Link
            href="/"
            className="w-full flex items-center justify-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded-xl transition-colors"
          >
            Back to my trips
          </Link>
        </div>
        <p className="text-xs text-slate-600 mt-3">
          Anything you save while offline will sync automatically when you reconnect.
        </p>
      </div>
    </main>
  );
}
