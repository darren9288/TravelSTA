// Canonical exchange-rate lookup for a wallet/pool. Single source of truth —
// the "wise→wise_rate else cash_rate, and pick the *_2 rate for the trip's
// SECOND foreign currency" heuristic was copied ~8× and two client copies had
// gone stale (ignoring the second currency), silently mis-converting pools whose
// currency is the trip's foreign_currency_2.
//
// Returns MYR-per-unit foreign (so myr = foreign / rate). 1 for MYR / unknown.

export type RateTrip = {
  foreign_currency?: string;
  cash_rate?: number;
  wise_rate?: number;
  foreign_currency_2?: string | null;
  cash_rate_2?: number | null;
  wise_rate_2?: number | null;
};

export function rateForWallet(
  trip: RateTrip | null | undefined,
  wallet: { name: string; currency: string } | null | undefined
): number {
  if (!trip || !wallet || wallet.currency === "MYR") return 1;
  const isWise = wallet.name.toLowerCase().includes("wise");
  if (wallet.currency === trip.foreign_currency) {
    return isWise ? Number(trip.wise_rate ?? 1) : Number(trip.cash_rate ?? 1);
  }
  if (trip.foreign_currency_2 && wallet.currency === trip.foreign_currency_2) {
    return isWise ? Number(trip.wise_rate_2 ?? 1) : Number(trip.cash_rate_2 ?? 1);
  }
  return 1;
}
