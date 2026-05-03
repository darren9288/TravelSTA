"use client";

export default function TripBackground({
  imageUrl,
  children,
}: {
  imageUrl: string | null;
  children: React.ReactNode;
}) {
  if (!imageUrl) return <>{children}</>;

  return (
    <>
      {/* Blurred background image — behind everything */}
      <div
        className="fixed inset-0 -z-10 scale-105 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${imageUrl})`,
          filter: "blur(4px)",
        }}
      />
      {/* Dark overlay for readability */}
      <div className="fixed inset-0 -z-10 bg-slate-950/70" />
      {children}
    </>
  );
}
