"use client";

// template.tsx (unlike layout.tsx) re-mounts on every navigation, so the
// fade-in re-runs each route change — a subtle page transition. Gated on
// prefers-reduced-motion via the .animate-fade-in utility (a no-op there).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
