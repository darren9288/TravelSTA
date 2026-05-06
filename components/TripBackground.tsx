"use client";

const VIDEO_EXTS = [".mp4", ".webm", ".mov"];

function isVideoUrl(url: string) {
  const lower = url.split("?")[0].toLowerCase();
  return VIDEO_EXTS.some((ext) => lower.endsWith(ext));
}

export default function TripBackground({
  imageUrl,
  children,
}: {
  imageUrl: string | null;
  children: React.ReactNode;
}) {
  if (!imageUrl) return <>{children}</>;

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
          className="fixed inset-0 -z-10 w-full h-full object-cover scale-105"
          style={{ filter: "blur(2px)" }}
        />
      ) : (
        <div
          className="fixed inset-0 -z-10 scale-105 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${imageUrl})`,
            filter: "blur(4px)",
          }}
        />
      )}
      {/* Dark overlay for readability */}
      <div className="fixed inset-0 -z-10 bg-slate-950/70" />
      {children}
    </>
  );
}
