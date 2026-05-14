export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";

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

  const baseURL = process.env.CLAUDE_PROXY_URL ?? "https://api.anthropic.com";
  const url = baseURL.endsWith("/v1") ? `${baseURL}/messages` : `${baseURL}/v1/messages`;

  const system = `You're a helpful travel-expense assistant for a Malaysian group trip tracker. Answer the user's question using ONLY the data in TRIP_CONTEXT below. If the data doesn't contain the answer, say so plainly — don't invent numbers.

Rules:
- All amounts are in MYR unless explicitly shown otherwise.
- Use plain language, no markdown headers, no JSON.
- Keep the answer short (2-4 sentences). Use specific numbers from the data.
- If the user asks for a list, show at most 5 items.

TRIP_CONTEXT:
${JSON.stringify(summary)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
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
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 500 });
    }
    const data = await res.json();
    const answer = (data.content?.[0]?.text ?? "").trim();
    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
