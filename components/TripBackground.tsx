"use client";
import { useEffect, useRef } from "react";

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

// Mobile browsers refuse (or silently pause) autoplay far more often than
// desktop — iOS Low Power Mode, Android data saver, and backgrounding all stop
// a muted autoplay video, and it then stays paused on return. Re-assert muted
// (the attribute alone isn't always enough once JS takes over) and retry play
// on mount, on tab re-focus, and after the first touch, which counts as the
// user gesture some browsers hold out for.
function useKeepPlaying(ref: React.RefObject<HTMLVideoElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const v = ref.current;
    if (!v) return;
    const tryPlay = () => {
      v.muted = true;
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => { /* blocked — the frame still shows */ });
    };
    tryPlay();
    const onVisible = () => { if (document.visibilityState === "visible") tryPlay(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", tryPlay);
    document.addEventListener("touchstart", tryPlay, { once: true, passive: true });
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", tryPlay);
      document.removeEventListener("touchstart", tryPlay);
    };
  }, [ref, enabled]);
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
          className="fixed inset-0 -z-10 w-full h-full object-cover kenburns"
          style={{ filter: "blur(2px)" }}
        />
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
      {children}
    </>
  );
}
