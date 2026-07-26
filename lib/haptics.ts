// Light haptic feedback. Chrome/Android support the Vibration API; iOS Safari /
// installed PWAs ignore it — so this is a no-op there, never an error. Keep
// patterns tiny so a tap feels like a native "tick", not a buzz.
export function haptic(pattern: number | number[] = 6): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* some engines throw if called outside a user gesture — ignore */
  }
}

export const HAPTIC_TAP = 6;          // every button press
export const HAPTIC_SUCCESS = [10, 40, 16]; // save / settle confirmations
export const HAPTIC_WARN = [20, 60, 20];    // errors
