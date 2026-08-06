"use client";
import { useEffect, useRef, useState } from "react";

const VIDEO_EXTS = [".mp4", ".webm", ".mov"];
const EXPANDED = 208;   // px of cover when scrolled to the top
const COLLAPSED = 64;   // px once it has shrunk into a title bar
const RANGE = EXPANDED - COLLAPSED;

function isVideoUrl(url: string) {
  const lower = url.split("?")[0].toLowerCase();
  return VIDEO_EXTS.some((e) => lower.endsWith(e));
}

/**
 * The trip cover, unblurred, filling the top of the page and shrinking into a
 * compact title bar as you scroll.
 *
 * The cover is otherwise only ever seen as a dark, blurred backdrop, so this
 * is the one place the photo/video is actually legible.
 *
 * Renders nothing without a cover — callers keep their existing header card.
 */
export default function CoverHeader({
  imageUrl,
  name,
  destination,
  dateLabel,
  joinCode,
  currency,
}: {
  imageUrl: string | null;
  name: string;
  destination?: string | null;
  dateLabel?: string | null;
  joinCode?: string | null;
  currency?: string | null;
}) {
  const [p, setP] = useState(0); // 0 = fully expanded, 1 = fully collapsed
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!imageUrl) return;
    // Deliberately NOT rAF-throttled. An rAF gate ("skip if one is pending")
    // deadlocks whenever frames are suspended — a backgrounded or low-power
    // tab never runs the callback, the pending flag never clears, and the
    // header stays frozen at whatever size it had even after you come back.
    // Scroll events are already coalesced to the frame rate, and this handler
    // only reads scrollY and sets state, so there's nothing to throttle.
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setP(Math.max(0, Math.min(1, y / RANGE)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [imageUrl]);

  // The same clip is already decoding as the page backdrop. Once this header
  // is a thin strip there's nothing to see, so stop the second decode.
  const isVideo = !!imageUrl && isVideoUrl(imageUrl);
  const collapsed = p > 0.95;
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    if (collapsed) v.pause();
    else v.play().catch(() => { /* autoplay refused — the frame still shows */ });
  }, [collapsed]);

  if (!imageUrl) return null;

  const height = EXPANDED - RANGE * p;

  return (
    <div
      className="sticky top-0 z-30 overflow-hidden"
      style={{ height, willChange: "height" }}
    >
      {/* Media */}
      {isVideo ? (
        <video
          ref={videoRef}
          src={imageUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />
      )}

      {/* Legibility: a base scrim that deepens as it collapses, so the title
          stays readable once it sits over a thin slice of a bright photo. */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(2,6,23,${0.15 + 0.5 * p}) 0%, rgba(2,6,23,${0.55 + 0.4 * p}) 100%)`,
        }}
      />
      {/* Blur only kicks in near the end, so the photo stays crisp while open. */}
      <div
        className="absolute inset-0 backdrop-blur-md transition-opacity duration-150"
        style={{ opacity: Math.max(0, (p - 0.75) * 4) }}
      />

      {/* Text. Sits at the bottom when open and centres itself as it shrinks. */}
      <div
        className="absolute left-0 right-0 px-5 flex items-end justify-between gap-3"
        style={{ bottom: 10 - 2 * p }}
      >
        <div className="min-w-0">
          <h1
            className="font-bold text-white truncate leading-tight"
            style={{ fontSize: `${26 - 8 * p}px`, textShadow: "0 2px 12px rgba(0,0,0,0.55)" }}
          >
            {name}
          </h1>
          {/* Fades out well before it would collide with the collapsed bar. */}
          <div style={{ opacity: Math.max(0, 1 - p * 1.8), height: p > 0.55 ? 0 : "auto", overflow: "hidden" }}>
            {destination && <p className="text-slate-200 text-sm mt-0.5 truncate">📍 {destination}</p>}
            {dateLabel && <p className="text-slate-300/80 text-xs mt-0.5 truncate">🗓 {dateLabel}</p>}
          </div>
        </div>

        <div
          className="flex flex-col items-end gap-1 flex-shrink-0"
          style={{ opacity: Math.max(0, 1 - p * 1.4) }}
        >
          {joinCode && (
            <span className="text-xs text-slate-200 bg-black/45 border border-white/15 px-2 py-1 rounded-lg font-mono backdrop-blur-sm">
              {joinCode}
            </span>
          )}
          {currency && <span className="text-xs text-slate-300/80">{currency} trip</span>}
        </div>
      </div>
    </div>
  );
}
