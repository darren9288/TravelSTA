"use client";
import { useState } from "react";
import { Link as LinkIcon, Check, Share2 } from "lucide-react";

// Renders the join code + a "Copy invite link" button that pastes
// `https://{origin}/join/{code}` into the clipboard. Also offers the
// native Web Share API on devices that support it (mobile mostly), so
// the user can tap "Share" and pick WhatsApp/Telegram/etc. directly.

export default function InviteLinkButton({
  code,
  tripName,
}: {
  code: string;
  tripName?: string;
}) {
  const [copied, setCopied] = useState(false);

  // Defensive: we're in a client component so window exists, but guard
  // anyway for SSR safety. Falls back to a relative path the user can
  // hand-prefix if window isn't available.
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${code}`
      : `/join/${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Older browsers without clipboard API — fall back to prompt so the
      // user can manually copy the URL.
      window.prompt("Copy this invite link:", link);
    }
  }

  async function share() {
    if (!navigator.share) {
      copy();
      return;
    }
    try {
      await navigator.share({
        title: tripName ? `Join ${tripName} on TravelSTA` : "Join my trip",
        text: tripName ? `Join ${tripName} on TravelSTA` : "Join my trip",
        url: link,
      });
    } catch {
      // User cancelled or browser refused — no-op.
    }
  }

  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
        <LinkIcon size={14} className="text-emerald-400 flex-shrink-0" />
        <span className="text-xs text-slate-300 font-mono truncate flex-1">{link}</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={copy}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {copied ? <Check size={14} /> : <LinkIcon size={14} />}
          {copied ? "Copied!" : "Copy invite link"}
        </button>
        {canShare && (
          <button
            onClick={share}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors"
            aria-label="Share"
            title="Share via…"
          >
            <Share2 size={14} />
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Whoever taps the link will be guided through sign-in (or sign-up) and
        joined to this trip automatically. Or share the code itself:{" "}
        <span className="font-mono text-slate-400">{code}</span>
      </p>
    </div>
  );
}
