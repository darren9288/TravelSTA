"use client";

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

export default function TripBackground({
  imageUrl,
  children,
}: {
  imageUrl: string | null;
  children: React.ReactNode;
}) {
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

  const isVideo = isVideoUrl(imageUrl);

  return (
    <>
      {isVideo ? (
        <video
          src={imageUrl}
          autoPlay
          muted
          loop
          playsInline
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
      {/* Dark overlay for readability */}
      <div className="fixed inset-0 -z-10 bg-slate-950/70" />
      {/* Cinematic vignette + faint film grain — grades busy photos and lifts
          text legibility. Static, so effectively free. */}
      <div className="fixed inset-0 -z-10 vignette-grain" aria-hidden="true" />
      <Sakura />
      {children}
    </>
  );
}
