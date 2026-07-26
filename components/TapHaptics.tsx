"use client";
import { useEffect } from "react";
import { haptic, HAPTIC_TAP } from "@/lib/haptics";

// One global listener that gives a light haptic tick on every ACTION press
// (buttons + role=button), the way native apps do. Navigation links (<a>) are
// intentionally excluded so scrolling/tapping around doesn't buzz constantly.
// Android/Chrome only — iOS ignores the Vibration API (silent no-op there).
// Users who set "reduce motion" at the OS level also get no haptics.
export default function TapHaptics() {
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      const el = t?.closest?.("button, [role='button']") as HTMLElement | null;
      if (!el) return;
      if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return;
      haptic(HAPTIC_TAP);
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  return null;
}
