export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";
import { getAIConfig } from "@/lib/ai-config";
import { mapUpstreamError } from "@/lib/ai-errors";

// POST /api/ai/ask
// Body: { question: string, trip_id: string }
// Returns: { answer: string }
// Builds a compact JSON snapshot of the trip's expenses, travelers, and
// settlement state, then asks Claude to answer the user's natural-language
// question with that context.
export async function POST(req: NextRequest) {
  const { question, trip_id } = await req.json();
  if (!question || !trip_id) {
    return NextResponse.json({ error: "question and trip_id required" }, { status: 400 });
  }

  // Require an authenticated trip member — don't let any URL crawler burn
  // Anthropic credits asking questions about random trips.
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = serverDb();
  const { data: member } = await db
    .from("trip_members")
    .select("role")
    .eq("trip_id", trip_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Not a member of this trip" }, { status: 403 });

  // Gather trip context. We deliberately keep this compact — Claude doesn't
  // need every column, just enough to answer typical questions.
  const [{ data: trip }, { data: travelers }, { data: expenses }, { data: splits }] = await Promise.all([
    db.from("trips").select("name, destination, start_date, end_date, foreign_currency, cash_rate, wise_rate, total_budget").eq("id", trip_id).single(),
    db.from("travelers").select("id, name, is_pool, archived").eq("trip_id", trip_id),
    db.from("expenses").select("id, date, category, payment_type, myr_amount, foreign_amount, currency, notes, paid_by_id").eq("trip_id", trip_id).order("date", { ascending: false }).limit(200),
    db.from("expense_splits").select("expense_id, traveler_id, amount, is_settled").in("expense_id", []),
  ]);

  // Fetch splits for the expenses we just got.
  const expenseIds = (expenses ?? []).map((e: { id: string }) => e.id);
  const { data: realSplits } = expenseIds.length
    ? await db.from("expense_splits").select("expense_id, traveler_id, amount, is_settled").in("expense_id", expenseIds)
    : { data: [] };

  // Build a name lookup so we don't have to send IDs to the model.
  const tName = new Map<string, string>();
  for (const t of travelers ?? []) tName.set(t.id, t.name);

  // Compact summary the model can scan in one pass.
  const summary = {
    trip: trip
      ? {
          name: trip.name,
          destination: trip.destination,
          dates: `${trip.start_date ?? "?"} → ${trip.end_date ?? "?"}`,
          foreign_currency: trip.foreign_currency,
          cash_rate: trip.cash_rate,
          wise_rate: trip.wise_rate,
          total_budget_myr: trip.total_budget ?? null,
        }
      : null,
    travelers: (travelers ?? [])
      .filter((t: { archived?: boolean }) => !t.archived)
      .map((t: { name: string; is_pool: boolean }) => ({ name: t.name, is_pool: t.is_pool })),
    expense_count: (expenses ?? []).length,
    total_myr: (expenses ?? []).reduce((s: number, e: { myr_amount: number }) => s + Number(e.myr_amount), 0),
    expenses: (expenses ?? []).slice(0, 80).map((e: { date: string; category: string; payment_type: string; myr_amount: number; foreign_amount: number | null; currency?: string; notes: string | null; paid_by_id: string }) => ({
      date: e.date,
      category: e.category,
      paid_by: tName.get(e.paid_by_id) ?? "?",
      payment: e.payment_type,
      myr: Number(e.myr_amount),
      foreign: e.foreign_amount,
      currency: e.currency ?? "MYR",
      notes: e.notes,
    })),
    splits: (realSplits ?? []).slice(0, 200).map((s: { traveler_id: string; amount: number; is_settled: boolean }) => ({
      traveler: tName.get(s.traveler_id) ?? "?",
      amount: Number(s.amount),
      settled: s.is_settled,
    })),
  };

  const cfg = await getAIConfig();

  // APP_GUIDE describes the app's pages, features, and where each setting
  // lives. Lets Claude answer "how do I..." or "where do I find..." questions
  // about the app itself, not just trip data. Updated whenever a UI change
  // adds/moves a feature so the assistant doesn't drift.
  const appGuide = `
APP_GUIDE — TravelSTA structure (use this to answer "where can I..." / "how do I..." questions):

Top-level pages:
- Trips list (/): all trips. Tap a trip card to enter.
- Account (/account): notification toggle, sign out, push diagnostics.
- Admin (/admin): super-admin only — manage Anthropic API tokens.

Inside a trip:
- Dashboard (/trips/[id]): overview, recent expenses, AI assistant FAB.
- Add Expense (/trips/[id]/add): three tabs:
   1. Form — manual entry
   2. AI Quick — paste/type description, Claude parses it
   3. 📷 Receipt — snap a photo, Claude reads it and fills the form
- Expenses (/trips/[id]/expenses): full list, edit/delete, settle splits.
- Settlement (/trips/[id]/settlement): who owes whom, "Settle All" button, history.
- Pool (/trips/[id]/pool): pool wallets, top-ups.
- Wallets (/trips/[id]/wallets): individual currency wallets, balance history.
- Analytics (/trips/[id]/analytics): charts and breakdowns.
- Settings (/trips/[id]/settings): trip name, dates, currency rates, members,
  notification frequency, background image, archive/danger zone.
- Import/Export (/trips/[id]/import-export): JSON/CSV/PDF backups.

Common settings (tell user the exact path):
- Enable/disable push notifications: Account page → "Notifications" toggle.
- Notification frequency (Frequent / 1-min / 5-min / Off): Trip Settings →
  "Notification frequency" card.
- Notification detail (Summary vs Detailed): same Trip Settings card — only
  shows when frequency is Medium or Low.
- Change exchange rate: Trip Settings → Cash rate / Wise rate inputs.
- Add a pool: Pool page → "New pool" button.
- Archive a traveler: Trip Settings → traveler list → archive icon.
- Change trip background: Trip Settings → Appearance → Upload (5MB max).
- Add a wallet: Wallets page → "New wallet" → pick traveler + currency.

Key features (mention only if relevant):
- Receipt OCR: Add Expense → 📷 Receipt tab → snap → "Use these values".
- Anomaly alerts: 9 auto-checks (duplicates, typos, MYR/JPY swaps, pool
  overdraft, etc.) — fire as push regardless of frequency setting.
- Hybrid push/toast: in-app shows toast, away from app shows phone banner.
- Currency auto-lock: picking a wallet locks the expense currency to match.
- Settle All only: per-person settling is intentionally not supported
  (breaks the zero-sum invariant).
- Roles: admin / editor / viewer — viewers can read but not edit.
`;

  const system = `You're a helpful assistant for TravelSTA, a Malaysian group trip expense tracker. You answer TWO kinds of questions:

A) Spending/data questions about THIS trip — use TRIP_CONTEXT.
B) App "how do I..." or "where do I find..." questions — use APP_GUIDE.

Decide which kind the question is, then answer.

Rules:
- All amounts in MYR unless otherwise stated.
- Plain language. No markdown headers, no JSON, no bullet lists unless really helpful.
- Keep answers short — 2-4 sentences. Specific numbers when from TRIP_CONTEXT.
- If asking "how do I X", give the exact path: "Account → Notifications" or
  "Trip Settings → scroll to Notification frequency". Don't invent menu items.
- If neither context has the answer, say so plainly. Don't make things up.

${appGuide}

TRIP_CONTEXT:
${JSON.stringify(summary)}`;

  try {
    const res = await fetch(cfg.messagesUrl, {
      method: "POST",
      headers: {
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system,
        messages: [{ role: "user", content: question }],
      }),
    });
    if (!res.ok) {
      const mapped = mapUpstreamError(res.status, await res.text().catch(() => ""));
      console.error("[ai/ask]", mapped.technical);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    const data = await res.json();
    const answer = (data.content?.[0]?.text ?? "").trim();
    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
