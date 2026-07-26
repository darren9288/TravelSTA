"use client";
import { useEffect } from "react";

// One global listener: when any <input type="number"> gains focus, set
// inputMode="decimal" (unless it already declares an inputMode). On phones this
// brings up the numeric keypad with a decimal point instead of the full QWERTY,
// making money entry much faster. No-op on desktop.
export default function NumericKeyboard() {
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (el instanceof HTMLInputElement && el.type === "number" && !el.getAttribute("inputmode")) {
        el.setAttribute("inputmode", "decimal");
      }
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);
  return null;
}
