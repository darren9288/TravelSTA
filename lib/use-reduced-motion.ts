"use client";
import { useEffect, useState } from "react";

/**
 * Live `prefers-reduced-motion` state.
 *
 * Starts false so server and first client render agree (no hydration
 * mismatch), then corrects on mount and follows OS changes.
 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduce(e.matches);
    // Safari < 14 only has the deprecated addListener.
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  return reduce;
}
