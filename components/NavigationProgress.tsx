"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Thin top progress bar that animates whenever the user navigates to a
// different route. Gives users instant visual feedback after a tap so they
// don't think the app is hanging — especially important on mobile where
// there's no hover/click feedback.
//
// Watches pathname changes and shows a 2px emerald bar across the top for
// ~700ms with a CSS animation. After that it auto-hides. Animation styles
// live in globals.css so we don't depend on styled-jsx.
export default function NavigationProgress() {
  const pathname = usePathname();
  const [nonce, setNonce] = useState(0);
  const [active, setActive] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    // Skip the very first render — no phantom bar on initial app load.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setNonce((n) => n + 1);
    setActive(true);
    const t = setTimeout(() => setActive(false), 800);
    return () => clearTimeout(t);
  }, [pathname]);

  if (!active) return null;

  return (
    <div
      key={nonce}
      className="fixed safe-top left-0 right-0 h-0.5 z-[200] pointer-events-none overflow-hidden"
    >
      <div className="h-full w-full bg-emerald-500 nav-progress-bar" />
    </div>
  );
}
