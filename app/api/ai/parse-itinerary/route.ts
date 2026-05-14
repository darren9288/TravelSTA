export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor } from "@/lib/role";

// POST /api/ai/parse-itinerary
// Body: { text: string, trip_id: string }
// Returns: { items: ParsedItineraryItem[] }
// Uses Claude to turn free-text day plans into structured itinerary items.
export async function POST(req: NextRequest) {
  const { text, trip_id } = await req.json();
  if (!text || !trip_id) {
    return NextResponse.json({ error: "text and trip_id required" }, { status: 400 });
  }
  const denied = await requireEditor(trip_id);
  if (denied) return denied;

  // Pull trip dates so Claude can resolve "Day 3" or "the second day" relative
  // to the actual trip calendar.
  const db = serverDb();
  const { data: trip } = await db
    .from("trips")
    .select("name, destination, start_date, end_date")
    .eq("id", trip_id)
    .single();

  const today = new Date().toISOString().slice(0, 10);
  const baseURL = process.env.CLAUDE_PROXY_URL ?? "https://api.anthropic.com";
  const url = baseURL.endsWith("/v1") ? `${baseURL}/messages` : `${baseURL}/v1/messages`;

  const system = `You convert free-text travel day plans into structured itinerary items.

Trip context:
- Name: ${trip?.name ?? "(unknown)"}
- Destination: ${trip?.destination ?? "(unknown)"}
- Trip dates: ${trip?.start_date ?? "?"} to ${trip?.end_date ?? "?"}
- Today's date: ${today}

Return ONLY valid JSON in this shape:
{
  "items": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:MM" or null,
      "end_time": "HH:MM" or null,
      "title": "short item title (5-8 words max)",
      "category": "flight" | "hotel" | "activity" | "food" | "transport" | "other",
      "notes": "any details from the user's text, or empty string"
    }
  ]
}

Rules:
- Use 24-hour HH:MM format for times.
- If no date is given for an item, infer the most recent date mentioned, or default to trip start.
- "Day 1" means the trip start date. "Day 2" = start_date + 1, etc.
- Pick the most fitting category. "food" includes restaurants, cafes, snacks. "transport" includes trains, taxis, ferries.
- Title should be plain (no emoji, no "📍").
- Output ONLY JSON, no commentary.`;

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
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 500 });
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
    return NextResponse.json({ items: json.items ?? [] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
