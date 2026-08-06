"use client";
import { useEffect, useState } from "react";

// Vercel gives every deploy its own permanent URL (project-<hash>.vercel.app)
// and every branch a preview URL (project-git-<branch>-<scope>.vercel.app).
// Those are immutable snapshots: they keep serving the build they were made
// from and never receive later deploys. Only the production hostname updates.
//
// If someone bookmarks one of those (or adds it to their home screen — the
// manifest's start_url is relative, so the icon is pinned to that origin too)
// they are stuck on an old build forever, with no way for a later deploy to
// reach them. This banner is the escape hatch: detect it and offer one tap to
// the same page on the live site.
export default function StaleOriginBanner() {
  const [liveUrl, setLiveUrl] = useState<string | null>(null);

  useEffect(() => {
    const prodHost = process.env.NEXT_PUBLIC_PROD_HOST;
    // Not on Vercel (local dev), or the var wasn't injected — stay silent
    // rather than risk a false alarm.
    if (!prodHost) return;
    const here = window.location.hostname;
    if (here === prodHost) return;
    // Only flag Vercel-hosted origins. A custom domain or localhost is not
    // something we should second-guess.
    if (!here.endsWith(".vercel.app")) return;
    setLiveUrl(`https://${prodHost}${window.location.pathname}${window.location.search}`);
  }, []);

  if (!liveUrl) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[400] safe-top bg-amber-950/95 border-b border-amber-700/60 px-4 py-2.5 flex items-center gap-3 backdrop-blur">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-amber-200">You&apos;re on an old link</p>
        <p className="text-[11px] text-amber-300/80 leading-snug">
          This bookmark points at a frozen copy of the app and won&apos;t get updates.
        </p>
      </div>
      <a
        href={liveUrl}
        className="flex-shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-amber-950 text-xs font-bold rounded-lg transition-colors"
      >
        Open latest
      </a>
    </div>
  );
}
