// Server-side anomaly detection.
//
// Each detector is a pure async function that takes the freshly written
// expense (or pool top-up) and the surrounding trip data, and returns 0+
// AnomalyResults. Callers iterate the results and fire a push per anomaly
// so the team sees a "⚠️" notification with enough detail to act on it.
//
// Design notes:
// - Detectors return strings, not React. Push notifications can only carry
//   plain text + a URL, so we keep everything string-only.
// - We do NOT exclude the triggerer when sending anomaly pushes. The whole
//   point is to alert the person who likely made the mistake so they can
//   fix it immediately.
// - Each anomaly gets a stable `tag` so iOS/Android replace prior identical
//   warnings instead of stacking them.

import { serverDb } from "./supabase";
import type { Expense, ExpenseSplit, Trip, Traveler } from "./supabase";

export type AnomalyType =
  | "duplicate"
  | "outlier"
  | "currency_swap"
  | "unbalanced_payer"
  | "midnight"
  | "category_mismatch"
  | "late_settle_add"
  | "pool_overdraft"
  | "zero_split";

export type AnomalyResult = {
  type: AnomalyType;
  title: string;        // notification title, e.g. "⚠️ Possible duplicate"
  body: string;         // notification body, e.g. "Same amount entered twice within 5 min"
  expenseId?: string;   // optional context — link target
  url?: string;         // override notification destination URL
  tag: string;          // stable dedup tag, e.g. `anomaly-duplicate-${expense.id}`
};

type ExpenseRow = Expense & { splits?: ExpenseSplit[] };

// ── 1. Duplicate expense ─────────────────────────────────────────────────────
// Same payer + same amount (±RM 5) + same category + within 5 minutes of an
// existing expense in the same trip. Catches the common "double-tap Save" bug.
async function detectDuplicate(expense: ExpenseRow, trip: Trip): Promise<AnomalyResult | null> {
  const db = serverDb();
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recent } = await db
    .from("expenses")
    .select("id, paid_by_id, myr_amount, category, created_at, notes")
    .eq("trip_id", trip.id)
    .eq("paid_by_id", expense.paid_by_id)
    .eq("category", expense.category)
    .gte("created_at", cutoff)
    .neq("id", expense.id)
    .limit(5);

  const match = (recent ?? []).find(
    (r: { myr_amount: number }) => Math.abs(Number(r.myr_amount) - Number(expense.myr_amount)) <= 5
  );
  if (!match) return null;

  return {
    type: "duplicate",
    title: `⚠️ Possible duplicate — ${trip.name}`,
    body: `RM ${expense.myr_amount} · ${expense.category} entered twice within 5 minutes. Tap to review.`,
    expenseId: expense.id,
    url: `/trips/${trip.id}/expenses`,
    tag: `anomaly-duplicate-${expense.id}`,
  };
}

// ── 2. Outlier amount ────────────────────────────────────────────────────────
// Expense > 3× the trip's average expense, AND > RM 200 (avoid flagging small
// items just because they exceed a tiny average).
async function detectOutlier(expense: ExpenseRow, trip: Trip): Promise<AnomalyResult | null> {
  if (Number(expense.myr_amount) < 200) return null;

  const db = serverDb();
  const { data: all } = await db
    .from("expenses")
    .select("myr_amount")
    .eq("trip_id", trip.id)
    .neq("id", expense.id);

  if (!all || all.length < 5) return null; // need a baseline
  const avg = all.reduce((s: number, e: { myr_amount: number }) => s + Number(e.myr_amount), 0) / all.length;
  if (avg < 50) return null; // ignore noise on tiny averages

  if (Number(expense.myr_amount) <= avg * 3) return null;

  return {
    type: "outlier",
    title: `⚠️ Unusual amount — ${trip.name}`,
    body: `RM ${Number(expense.myr_amount).toFixed(0)} for ${expense.category} (trip avg RM ${avg.toFixed(0)}). Typo?`,
    expenseId: expense.id,
    url: `/trips/${trip.id}/expenses`,
    tag: `anomaly-outlier-${expense.id}`,
  };
}

// ── 3. Wrong currency direction (MYR↔JPY swapped) ────────────────────────────
// If both myr_amount and foreign_amount are entered, the ratio
// foreign / myr should match the trip's exchange rate (~30 for JPY/MYR).
// If the ratio is suspiciously close to 1, the user probably typed the same
// number into both fields (e.g. RM 1500 = ¥1500 — would mean ¥1 = RM 1).
async function detectCurrencySwap(expense: ExpenseRow, trip: Trip): Promise<AnomalyResult | null> {
  const fa = Number(expense.foreign_amount ?? 0);
  const myr = Number(expense.myr_amount ?? 0);
  if (fa <= 0 || myr <= 0) return null;

  const ratio = fa / myr;
  // Acceptable ratio is roughly the trip's rate ± 20%. The trip's rate is
  // stored as MYR-per-foreign (e.g. cash_rate=33 means ¥33/RM, so ratio ≈ 30).
  const expected = (Number(trip.cash_rate ?? 30) + Number(trip.wise_rate ?? 30)) / 2;
  if (expected <= 0) return null;

  // Suspicious if the ratio is way below expected (close to 1 = swapped).
  if (ratio >= expected * 0.5) return null;

  return {
    type: "currency_swap",
    title: `⚠️ Currency check — ${trip.name}`,
    body: `RM ${myr.toFixed(0)} = ${trip.foreign_currency} ${fa.toFixed(0)}? Looks reversed (expected ~${expected}× ratio).`,
    expenseId: expense.id,
    url: `/trips/${trip.id}/expenses`,
    tag: `anomaly-swap-${expense.id}`,
  };
}

// ── 4. Unbalanced payer ──────────────────────────────────────────────────────
// In the last 14 days of the trip, one traveler paid for 80%+ of the
// expenses count. Often means others forgot to log their own spending.
async function detectUnbalancedPayer(expense: ExpenseRow, trip: Trip): Promise<AnomalyResult | null> {
  const db = serverDb();
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: recent } = await db
    .from("expenses")
    .select("paid_by_id")
    .eq("trip_id", trip.id)
    .gte("date", cutoff);

  if (!recent || recent.length < 10) return null;

  const counts: Record<string, number> = {};
  for (const e of recent as { paid_by_id: string }[]) {
    counts[e.paid_by_id] = (counts[e.paid_by_id] ?? 0) + 1;
  }
  const topId = Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b));
  const topCount = counts[topId];
  const share = topCount / recent.length;
  if (share < 0.8) return null;

  // Only fire if the latest expense is by the same heavy-payer (avoids
  // flagging multiple times — only flags when they pay AGAIN).
  if (topId !== expense.paid_by_id) return null;

  const { data: t } = await db.from("travelers").select("name").eq("id", topId).single();
  const name = (t as { name?: string } | null)?.name ?? "Someone";

  return {
    type: "unbalanced_payer",
    title: `⚠️ One-person spending — ${trip.name}`,
    body: `${name} paid for ${topCount} of last ${recent.length} expenses. Others might have unlogged spending.`,
    expenseId: expense.id,
    url: `/trips/${trip.id}/expenses`,
    tag: `anomaly-unbalanced-${trip.id}`, // trip-level tag — replaces prior warning
  };
}

// ── 5. Midnight expense ──────────────────────────────────────────────────────
// Logged between 1 AM and 5 AM local time, AND > RM 100. Likely late-night
// drunk-shopping or accidental tap; flag for review.
function detectMidnight(expense: ExpenseRow, trip: Trip): AnomalyResult | null {
  if (Number(expense.myr_amount) < 100) return null;
  const hour = new Date(expense.created_at).getHours();
  if (hour < 1 || hour > 5) return null;

  return {
    type: "midnight",
    title: `🌙 Late-night expense — ${trip.name}`,
    body: `RM ${Number(expense.myr_amount).toFixed(0)} · ${expense.category} logged at ${hour}:${String(new Date(expense.created_at).getMinutes()).padStart(2, "0")} AM. Double-check.`,
    expenseId: expense.id,
    url: `/trips/${trip.id}/expenses`,
    tag: `anomaly-midnight-${expense.id}`,
  };
}

// ── 6. Category mismatch ─────────────────────────────────────────────────────
// Each category has rough min/max sanity bounds. Anything way outside
// (e.g. RM 30 for "Hotel" or RM 5000 for "Small Eat") gets flagged.
const CATEGORY_BOUNDS: Record<string, { min: number; max: number }> = {
  Hotel: { min: 80, max: 5000 },
  Flight: { min: 100, max: 10000 },
  "Small Eat": { min: 1, max: 80 },
  Breakfast: { min: 5, max: 200 },
  Lunch: { min: 5, max: 300 },
  Dinner: { min: 10, max: 500 },
  Transport: { min: 1, max: 500 },
  "Car Rental": { min: 50, max: 3000 },
  Fuel: { min: 10, max: 500 },
  Souvenirs: { min: 1, max: 2000 },
  Activity: { min: 5, max: 2000 },
};
function detectCategoryMismatch(expense: ExpenseRow, trip: Trip): AnomalyResult | null {
  const bounds = CATEGORY_BOUNDS[expense.category];
  if (!bounds) return null;
  const amt = Number(expense.myr_amount);
  if (amt >= bounds.min && amt <= bounds.max) return null;

  const reason = amt < bounds.min
    ? `unusually low for ${expense.category} (typical range RM ${bounds.min}–${bounds.max})`
    : `unusually high for ${expense.category} (typical range RM ${bounds.min}–${bounds.max})`;

  return {
    type: "category_mismatch",
    title: `⚠️ Category check — ${trip.name}`,
    body: `RM ${amt.toFixed(0)} is ${reason}. Right category?`,
    expenseId: expense.id,
    url: `/trips/${trip.id}/expenses`,
    tag: `anomaly-cat-${expense.id}`,
  };
}

// ── 7. Late-settle add ───────────────────────────────────────────────────────
// An expense was added with date < latest Settle All date. Retroactive
// additions don't get included in the prior settlement round, so the team
// needs to know to either skip it or run Settle All again.
async function detectLateSettleAdd(expense: ExpenseRow, trip: Trip): Promise<AnomalyResult | null> {
  const db = serverDb();
  const { data: lastSettle } = await db
    .from("settlement_payments")
    .select("created_at")
    .eq("trip_id", trip.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const latest = (lastSettle ?? [])[0] as { created_at?: string } | undefined;
  if (!latest?.created_at) return null;

  const settleDate = new Date(latest.created_at).toISOString().slice(0, 10);
  if (expense.date >= settleDate) return null;

  return {
    type: "late_settle_add",
    title: `⚠️ Expense added after Settle All — ${trip.name}`,
    body: `RM ${Number(expense.myr_amount).toFixed(0)} for ${expense.date} added, but Settle All was done on ${settleDate}. Run Settle All again or this won't be balanced.`,
    expenseId: expense.id,
    url: `/trips/${trip.id}/settlement`,
    tag: `anomaly-latesettle-${expense.id}`,
  };
}

// ── 8. Pool overdraft ────────────────────────────────────────────────────────
// For each pool traveler: sum(pool_topups) - sum(expenses paid by pool) < 0
// means the pool has spent more than was contributed. Often happens when
// someone keeps charging the pool without topping it up.
export async function detectPoolOverdraft(tripId: string, tripName: string): Promise<AnomalyResult[]> {
  const db = serverDb();
  const [{ data: pools }, { data: topups }, { data: expenses }] = await Promise.all([
    db.from("travelers").select("id, name").eq("trip_id", tripId).eq("is_pool", true),
    db.from("pool_topups").select("pool_id, myr_amount").eq("trip_id", tripId),
    db.from("expenses").select("paid_by_id, myr_amount").eq("trip_id", tripId),
  ]);

  const results: AnomalyResult[] = [];
  for (const pool of (pools ?? []) as { id: string; name: string }[]) {
    const contributed = (topups ?? [])
      .filter((t: { pool_id: string }) => t.pool_id === pool.id)
      .reduce((s: number, t: { myr_amount: number }) => s + Number(t.myr_amount), 0);
    const spent = (expenses ?? [])
      .filter((e: { paid_by_id: string }) => e.paid_by_id === pool.id)
      .reduce((s: number, e: { myr_amount: number }) => s + Number(e.myr_amount), 0);
    const balance = contributed - spent;
    if (balance >= 0) continue;

    results.push({
      type: "pool_overdraft",
      title: `⚠️ Pool overdraft — ${tripName}`,
      body: `${pool.name} spent RM ${spent.toFixed(0)}, only RM ${contributed.toFixed(0)} contributed (short RM ${Math.abs(balance).toFixed(0)}).`,
      url: `/trips/${tripId}/pool`,
      tag: `anomaly-overdraft-${pool.id}`,
    });
  }
  return results;
}

// ── 9. Zero-amount split ─────────────────────────────────────────────────────
// An equal split with one or more travelers owing RM 0 usually means someone
// was added/removed from the split but not all rows recomputed. The expense
// won't balance correctly until the splits are fixed.
async function detectZeroSplit(expense: ExpenseRow, trip: Trip): Promise<AnomalyResult | null> {
  const db = serverDb();
  const { data: splits } = await db
    .from("expense_splits")
    .select("amount, traveler_id, traveler:travelers!traveler_id(name)")
    .eq("expense_id", expense.id);

  if (!splits || splits.length < 2) return null;

  const zeroes = (splits as { amount: number; traveler?: { name?: string } }[])
    .filter((s) => Number(s.amount) === 0)
    .map((s) => s.traveler?.name ?? "?");

  if (zeroes.length === 0) return null;
  // Only flag for equal splits — individual/custom splits intentionally have RM 0 entries.
  if (expense.split_type !== "equal") return null;

  return {
    type: "zero_split",
    title: `⚠️ Zero-amount split — ${trip.name}`,
    body: `Equal split for RM ${Number(expense.myr_amount).toFixed(0)} (${expense.category}) has ${zeroes.length} person(s) with RM 0: ${zeroes.join(", ")}. Fix the splits.`,
    expenseId: expense.id,
    url: `/trips/${trip.id}/expenses`,
    tag: `anomaly-zerosplit-${expense.id}`,
  };
}

// ── Public entry point ───────────────────────────────────────────────────────
// Runs every relevant detector against a freshly created/updated expense.
// Returns 0+ AnomalyResults — callers fire a push per result.
export async function detectExpenseAnomalies(
  expense: ExpenseRow,
  trip: Trip
): Promise<AnomalyResult[]> {
  const results = await Promise.all([
    detectDuplicate(expense, trip),
    detectOutlier(expense, trip),
    detectCurrencySwap(expense, trip),
    detectUnbalancedPayer(expense, trip),
    Promise.resolve(detectMidnight(expense, trip)),
    Promise.resolve(detectCategoryMismatch(expense, trip)),
    detectLateSettleAdd(expense, trip),
    detectZeroSplit(expense, trip),
  ]);
  return results.filter((r): r is AnomalyResult => r !== null);
}

// Unused but exported for callers that want type-safe traveler lookups when
// composing custom anomaly messages.
export type _TravelerHint = Traveler;
