"use client";
import { useEffect, useRef, useState } from "react";

const VIDEO_EXTS = [".mp4", ".webm", ".mov"];

function isVideoUrl(url: string) {
  const lower = url.split("?")[0].toLowerCase();
  return VIDEO_EXTS.some((ext) => lower.endsWith(ext));
}

// A handful of pink petals drifting behind the content — the signature Japan
// touch. Kept sparse (7 nodes) and low-opacity so it reads refined, not kitsch.
// The CSS hides it entirely under prefers-reduced-motion.
function Sakura() {
  return (
    <div className="sakura" aria-hidden="true">
      {Array.from({ length: 7 }).map((_, i) => (
        <span key={i} className="petal" />
      ))}
    </div>
  );
}

// Keep the background video actually showing a picture on phones.
//
// Two separate problems, both mobile-only:
//  1. Muted autoplay is refused or silently paused (iOS Low Power Mode,
//     Android data saver, backgrounding) — and once paused it stays paused.
//  2. A paused <video> renders whichever frame it is parked on, and these
//     clips typically fade in from black, so frame 0 is literally #000. That
//     is indistinguishable from "no background at all" — which is exactly
//     what a blocked autoplay looks like to the user.
//
// So: re-assert muted and retry play on mount / metadata / focus / every
// gesture, and if it is still paused shortly after load, seek onto a frame
// that actually has picture so the wallpaper is visible even when playback
// never starts.
function useKeepPlaying(ref: React.RefObject<HTMLVideoElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const v = ref.current;
    if (!v) return;

    // Park a stalled video on a frame with real picture instead of the black
    // first frame. Guarded so it never fights actual playback.
    const parkOnVisibleFrame = () => {
      if (!v.paused) return;
      const d = v.duration;
      if (!d || !isFinite(d) || v.currentTime > 0.3) return;
      try { v.currentTime = Math.min(2, d * 0.15); } catch { /* seek unsupported */ }
    };

    const tryPlay = () => {
      v.muted = true; // the attribute alone isn't always honoured once JS runs
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(parkOnVisibleFrame);
    };

    tryPlay();
    // If autoplay was refused, make sure we're at least showing a real frame.
    const fallbackTimer = setTimeout(parkOnVisibleFrame, 1500);

    const onVisible = () => { if (document.visibilityState === "visible") tryPlay(); };
    // Retry on EVERY gesture (not once): the first tap may land before the
    // media is ready, and some browsers only release autoplay after a gesture.
    const onGesture = () => { if (v.paused) tryPlay(); };

    v.addEventListener("loadedmetadata", tryPlay);
    v.addEventListener("canplay", tryPlay);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", tryPlay);
    document.addEventListener("touchstart", onGesture, { passive: true });
    document.addEventListener("click", onGesture);

    return () => {
      clearTimeout(fallbackTimer);
      v.removeEventListener("loadedmetadata", tryPlay);
      v.removeEventListener("canplay", tryPlay);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", tryPlay);
      document.removeEventListener("touchstart", onGesture);
      document.removeEventListener("click", onGesture);
    };
  }, [ref, enabled]);
}

// Temporary on-device diagnostic. Add ?bgdebug=1 to any trip URL to see what
// the background <video> is actually doing on that specific phone — desktop
// devtools can't tell us why iOS refuses to paint or load it.
function BgDebug({ videoRef, url }: { videoRef: React.RefObject<HTMLVideoElement | null>; url: string }) {
  const [on, setOn] = useState(false);
  const [info, setInfo] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("bgdebug")) return;
    setOn(true);
    const READY = ["0 NOTHING", "1 METADATA", "2 CURRENT", "3 FUTURE", "4 ENOUGH"];
    const NET = ["0 EMPTY", "1 IDLE", "2 LOADING", "3 NO_SOURCE"];
    const tick = () => {
      const v = videoRef.current;
      const nav = navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } };
      setInfo({
        element: v ? "found" : "MISSING",
        readyState: v ? READY[v.readyState] ?? v.readyState : "-",
        networkState: v ? NET[v.networkState] ?? v.networkState : "-",
        paused: v ? String(v.paused) : "-",
        currentTime: v ? v.currentTime.toFixed(2) : "-",
        duration: v && isFinite(v.duration) ? v.duration.toFixed(1) : "-",
        videoSize: v ? `${v.videoWidth}x${v.videoHeight}` : "-",
        error: v?.error ? `code ${v.error.code}` : "none",
        buffered: v && v.buffered.length ? `${v.buffered.end(0).toFixed(1)}s` : "0",
        rectOnScreen: v ? (() => { const r = v.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })() : "-",
        netType: nav.connection?.effectiveType ?? "?",
        saveData: String(nav.connection?.saveData ?? "?"),
        reducedMotion: String(window.matchMedia("(prefers-reduced-motion: reduce)").matches),
      });
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [videoRef]);

  if (!on) return null;
  return (
    <div className="fixed top-2 left-2 right-2 z-[300] bg-black/90 border border-emerald-500/50 rounded-lg p-2 text-[10px] font-mono text-emerald-300 leading-tight">
      <p className="text-white font-bold mb-1">BG DEBUG — screenshot this</p>
      {Object.entries(info).map(([k, val]) => (
        <div key={k}>{k}: <span className="text-white">{String(val)}</span></div>
      ))}
      <p className="mt-1 break-all text-slate-500">{url.slice(0, 90)}</p>
      <button
        onClick={() => { const v = videoRef.current; if (v) { v.muted = true; v.play().catch((e) => alert("play() rejected: " + e.name + " — " + e.message)); } }}
        className="mt-1 px-2 py-1 bg-emerald-600 text-white rounded"
      >
        Tap to force play
      </button>
    </div>
  );
}

export default function TripBackground({
  imageUrl,
  children,
}: {
  imageUrl: string | null;
  children: React.ReactNode;
}) {
  const isVideo = !!imageUrl && isVideoUrl(imageUrl);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Hook runs before any early return so the order stays stable.
  useKeepPlaying(videoRef, isVideo);

  // No cover photo → an animated accent aurora fills the void instead of a
  // flat slate canvas. Both layers read --accent-rgb, so they follow the theme.
  if (!imageUrl) {
    return (
      <>
        <div className="ambient-bg" aria-hidden="true" />
        <Sakura />
        {children}
      </>
    );
  }

  return (
    <>
      {/* Painted BELOW the media (earlier in DOM, same -z-10). If the photo or
          video never loads — data saver, flaky mobile connection — the element
          above stays transparent and this shows through, so the user gets the
          themed aurora instead of a black void. */}
      <div className="ambient-bg" aria-hidden="true" />
      {isVideo ? (
        // iOS composites <video> in its own hardware layer, and a `filter`
        // applied directly to the video element is a known way to make that
        // layer fail to paint (the video simply never appears, while ordinary
        // DOM around it renders fine). Put the blur on a wrapper instead and
        // let the video itself stay a plain, unfiltered layer.
        <div
          className="fixed inset-0 -z-10 overflow-hidden"
          style={{ filter: "blur(2px)", WebkitTransform: "translateZ(0)", transform: "translateZ(0)" }}
          aria-hidden="true"
        >
          <video
            ref={videoRef}
            src={imageUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            className="w-full h-full object-cover kenburns"
          />
        </div>
      ) : (
        <div
          className="fixed inset-0 -z-10 kenburns bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${imageUrl})`,
            filter: "blur(4px)",
          }}
        />
      )}
      {/* Dark overlay for readability. Lighter on phones: there the cards span
          ~90% of the width and supply their own contrast, so a 70% wash on top
          of them left no wallpaper visible at all. */}
      <div className="fixed inset-0 -z-10 bg-slate-950/50 md:bg-slate-950/70" />
      {/* Cinematic vignette + faint film grain — grades busy photos and lifts
          text legibility. Static, so effectively free. */}
      <div className="fixed inset-0 -z-10 vignette-grain" aria-hidden="true" />
      <Sakura />
      {isVideo && <BgDebug videoRef={videoRef} url={imageUrl} />}
      {children}
    </>
  );
}
