export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor } from "@/lib/role";
import { getAIConfig } from "@/lib/ai-config";
import { mapUpstreamError } from "@/lib/ai-errors";

// POST /api/ai/suggest-itinerary
// Body: { prompt?: string, date: string, trip_id: string }
// Returns: { suggestions: { time, title, category, notes, estimated_cost_myr }[] }
export async function POST(req: NextRequest) {
  const { prompt, date, trip_id } = await req.json();
  if (!trip_id || !date) {
    return NextResponse.json({ error: "trip_id and date required" }, { status: 400 });
  }
  const denied = await requireEditor(trip_id);
  if (denied) return denied;

  const db = serverDb();
  const { data: trip } = await db
    .from("trips")
    .select("name, destination, foreign_currency, cash_rate, wise_rate")
    .eq("id", trip_id)
    .single();

  // Pull existing items for the same date so suggestions don't duplicate
  // what the user already planned.
  const { data: existingItems } = await db
    .from("itinerary_items")
    .select("title, category, time, end_time")
    .eq("trip_id", trip_id)
    .eq("date", date);

  const cfg = await getAIConfig();

  const system = `You're a local travel guide suggesting itinerary items for a Malaysian-based group trip. Generate 4-6 concrete activity / food / transport suggestions for the given day, given the destination and any user preference.

Destination: ${trip?.destination ?? "(unknown)"}
Date: ${date}
Existing plans for this day (avoid duplicating): ${JSON.stringify(existingItems ?? [])}
Trip currency: ${trip?.foreign_currency ?? "MYR"} (cash rate ${trip?.cash_rate ?? "?"} per MYR)

Return ONLY valid JSON:
{
  "suggestions": [
    {
      "time": "HH:MM" or null,
      "title": "short item title (5-10 words, no emoji)",
      "category": "flight" | "hotel" | "activity" | "food" | "transport" | "other",
      "notes": "1 sentence why / what to expect (include practical detail like ticket price, queue time, opening hours if you know it)",
      "estimated_cost_myr": number or null (per-person rough cost in MYR)
    }
  ]
}

Rules:
- Pick real, locally-known places when possible (Sensoji, Hozugawa, etc.).
- Times should be sensible for a daily plan (morning, lunch, afternoon, evening).
- estimated_cost_myr is approximate — use what you'd realistically expect to spend per person.
- Output JSON only, no commentary.`;

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
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: prompt || "Plan a balanced day mixing some sightseeing, food, and downtime." }],
      }),
    });
    if (!res.ok) {
      const mapped = mapUpstreamError(res.status, await res.text().catch(() => ""));
      console.error("[ai/suggest-itinerary]", mapped.technical);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    const data = await res.json();
    const content = data.content?.[0];
    if (!content || content.type !== "text") {
      return NextResponse.json({ error: "Unexpected AI response" }, { status: 500 });
    }
    const startIdx = content.text.indexOf("{");
    if (startIdx === -1) {
      return NextResponse.json({ error: "Couldn't parse AI response" }, { status: 500 });
    }
    const json = JSON.parse(content.text.slice(startIdx, content.text.lastIndexOf("}") + 1));
    return NextResponse.json({ suggestions: json.suggestions ?? [] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
