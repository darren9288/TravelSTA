export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

// POST /api/ai/categorize
// Body: { description: string }
// Returns: { category: string }
// Tiny one-shot prompt — picks the best category for a free-text description.
export async function POST(req: NextRequest) {
  const { description } = await req.json();
  if (!description || typeof description !== "string" || description.trim().length < 3) {
    return NextResponse.json({ error: "description required" }, { status: 400 });
  }

  const baseURL = process.env.CLAUDE_PROXY_URL ?? "https://api.anthropic.com";
  const url = baseURL.endsWith("/v1") ? `${baseURL}/messages` : `${baseURL}/v1/messages`;

  const system = `Pick the single most fitting expense category for the user's description. Return ONLY JSON: {"category":"<one of: Activity, Breakfast, Lunch, Dinner, Small Eat, Entertainment, Others, Souvenirs, Supplies, Laundry, Hotel, Flight, Transport, Car Rental, Fuel, Travel Related>"}`;

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
        max_tokens: 64,
        system,
        messages: [{ role: "user", content: description.slice(0, 200) }],
      }),
    });
    if (!res.ok) return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 500 });
    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? "";
    const start = text.indexOf("{");
    if (start === -1) return NextResponse.json({ error: "Bad AI response" }, { status: 500 });
    const json = JSON.parse(text.slice(start, text.lastIndexOf("}") + 1));
    return NextResponse.json({ category: json.category });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
