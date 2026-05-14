export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";
import { getAIConfig } from "@/lib/ai-config";

// POST /api/ai/recap
// Body: { trip_id: string }
// Returns: { recap: string }
// Generates a shareable narrative summary of the trip from its data.
export async function POST(req: NextRequest) {
  const { trip_id } = await req.json();
  if (!trip_id) return NextResponse.json({ error: "trip_id required" }, { status: 400 });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = serverDb();
  const { data: member } = await db
    .from("trip_members")
    .select("role")
    .eq("trip_id", trip_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  // Pull the headline stats — enough to write a flavoured summary.
  const [{ data: trip }, { data: travelers }, { data: expenses }, { data: itinerary }] = await Promise.all([
    db.from("trips").select("name, destination, start_date, end_date, foreign_currency").eq("id", trip_id).single(),
    db.from("travelers").select("id, name, is_pool").eq("trip_id", trip_id),
    db.from("expenses").select("date, category, myr_amount, paid_by_id, notes").eq("trip_id", trip_id).order("date"),
    db.from("itinerary_items").select("date, title, category").eq("trip_id", trip_id).order("date"),
  ]);

  const tName = new Map<string, string>();
  for (const t of travelers ?? []) tName.set(t.id, t.name);
  const real = (travelers ?? []).filter((t: { is_pool: boolean }) => !t.is_pool);

  // Tally per-traveler total spend.
  const byTraveler: Record<string, number> = {};
  for (const t of real) byTraveler[t.name] = 0;
  let grandTotal = 0;
  for (const e of expenses ?? []) {
    grandTotal += Number(e.myr_amount);
    const n = tName.get(e.paid_by_id) ?? "?";
    if (byTraveler[n] !== undefined) byTraveler[n] += Number(e.myr_amount);
  }

  const byCategory: Record<string, number> = {};
  for (const e of expenses ?? []) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.myr_amount);
  }
  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount }));

  const days = trip?.start_date && trip?.end_date
    ? Math.max(1, Math.round((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86_400_000) + 1)
    : (expenses ?? []).length > 0
      ? new Set((expenses ?? []).map((e: { date: string }) => e.date)).size
      : 1;

  const summary = {
    name: trip?.name,
    destination: trip?.destination,
    dates: `${trip?.start_date ?? "?"} → ${trip?.end_date ?? "?"}`,
    days,
    travelers: real.map((t: { name: string }) => t.name),
    grand_total_myr: grandTotal,
    avg_per_day_myr: grandTotal / Math.max(days, 1),
    avg_per_person_myr: real.length > 0 ? grandTotal / real.length : 0,
    by_traveler: byTraveler,
    top_categories: topCategories,
    itinerary_count: (itinerary ?? []).length,
    expense_count: (expenses ?? []).length,
  };

  const cfg = await getAIConfig();

  const system = `You write friendly, share-worthy trip recaps for group travelers in Malaysia. The recap should feel like a WhatsApp message you'd send to your travel mates after the trip — warm, factual, no marketing fluff. About 150-250 words.

Structure (loosely):
- Opening line: trip name, destination, dates.
- The vibe: 1-2 sentences on what you did (use itinerary count + top categories as cues).
- The numbers: total spent, per-person average, biggest spending categories.
- Settle up: per-traveler totals if interesting.
- Closer: positive sign-off.

Style:
- Plain English, no markdown headers.
- Use the actual names and numbers from TRIP_DATA below.
- No emojis (or at most one or two).
- Keep it crisp.

TRIP_DATA:
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
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: "Write the trip recap." }],
      }),
    });
    if (!res.ok) return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 500 });
    const data = await res.json();
    const recap = (data.content?.[0]?.text ?? "").trim();
    return NextResponse.json({ recap });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
