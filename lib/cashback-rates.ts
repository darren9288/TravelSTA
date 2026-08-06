// Cashback rate presets for the Add Expense auto-fill button.
//
// These used to be a hardcoded "Ryt −1.2%". They're now a per-trip list the
// user edits in Trip Settings, with one preset marked active; the auto-fill
// buttons on the Form tab and every Separate row use whichever is active.
// Stored on `trips` (migration 029) so the list and the active choice are
// shared by everyone on the trip.

export type CashbackRate = {
  id: string;
  name: string;
  /** Percent, as typed by the user — 1.2 means 1.2%, not 0.012. */
  percent: number;
};

// Used when the trip has no list yet (or migration 029 hasn't been run).
export const DEFAULT_CASHBACK_RATES: CashbackRate[] = [
  { id: "ryt", name: "Ryt", percent: 1.2 },
  { id: "tng", name: "TNG", percent: 3 },
];

/** Coerce whatever is in the jsonb column into a usable list. */
export function parseCashbackRates(raw: unknown): CashbackRate[] {
  if (!Array.isArray(raw)) return DEFAULT_CASHBACK_RATES;
  const cleaned = raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? "").trim(),
      percent: Number(r.percent),
    }))
    // A rate with no name or a non-finite/negative percent can't drive the
    // button, so drop it rather than render a broken row.
    .filter((r) => r.id && r.name && Number.isFinite(r.percent) && r.percent >= 0);
  return cleaned.length > 0 ? cleaned : DEFAULT_CASHBACK_RATES;
}

/** The preset the buttons should use — falls back to the first one. */
export function activeCashbackRate(rates: CashbackRate[], activeId?: string | null): CashbackRate {
  return rates.find((r) => r.id === activeId) ?? rates[0] ?? DEFAULT_CASHBACK_RATES[0];
}

/**
 * Split a gross amount into what gets recorded as the expense and what gets
 * recorded as cashback.
 *
 * The rounding here is deliberate and was pinned down against real receipts:
 *   - amount   is ROUNDED to 2dp   (42.47 @1.2% → 41.96, not 41.97)
 *   - cashback is FLOORED to 2dp   (34.72 @1.2% → 0.41,  not 0.42)
 * They're computed independently, so amount + cashback need not equal gross —
 * that's intended; the bank rounds the rebate down.
 */
export function applyCashbackRate(gross: number, percent: number): { net: number; cashback: number } {
  const r = percent / 100;
  const net = Math.round(gross * (1 - r) * 100) / 100;
  // +1e-6 absorbs binary float error so 0.41999999 doesn't floor to 0.41.
  const cashback = Math.floor(gross * r * 100 + 1e-6) / 100;
  return { net, cashback };
}

/** "Ryt −1.2%" — used on buttons and in the picker. */
export function formatRateLabel(rate: CashbackRate): string {
  const pct = Number.isInteger(rate.percent) ? String(rate.percent) : String(rate.percent);
  return `${rate.name} −${pct}%`;
}

/** Stable-ish id for a newly added preset (no crypto dependency needed). */
export function slugifyRateId(name: string, existing: CashbackRate[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rate";
  let id = base;
  let n = 2;
  while (existing.some((r) => r.id === id)) id = `${base}-${n++}`;
  return id;
}
