export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireEditor } from "@/lib/role";
import { getAIConfig } from "@/lib/ai-config";
import { mapUpstreamError } from "@/lib/ai-errors";

// POST /api/ai/parse-receipt
// Body: { image_base64: string, trip_id: string, hint_currency?: string }
// Returns: { amount, currency, date, items, suggested_category, confidence, raw_text }
//
// Uses Claude Vision to read a photo of a receipt and pull out structured
// data so the client can pre-fill the Add Expense form. The client is
// responsible for compressing the image (target ~500KB max) before sending
// — full-resolution phone photos waste tokens and timeout the request.

// Allowed expense categories — kept in sync with lib/supabase.ts CATEGORIES
// so Claude only returns values the form's dropdown can accept.
const CATEGORIES = [
  "Activity", "Breakfast", "Lunch", "Dinner", "Small Eat",
  "Entertainment", "Others", "Souvenirs", "Supplies", "Laundry",
  "Hotel", "Flight", "Transport", "Car Rental", "Fuel",
  "Travel Related",
];

export async function POST(req: NextRequest) {
  const { image_base64, trip_id, hint_currency } = await req.json();
  if (!image_base64 || typeof image_base64 !== "string") {
    return NextResponse.json({ error: "image_base64 required" }, { status: 400 });
  }
  if (!trip_id) {
    return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  }
  const denied = await requireEditor(trip_id);
  if (denied) return denied;

  // Pull trip currency context so Claude knows which currency to prefer
  // when the receipt has multiple (e.g. JPY shown, MYR equivalent printed).
  const db = serverDb();
  const { data: trip } = await db
    .from("trips")
    .select("foreign_currency, foreign_currency_2, destination")
    .eq("id", trip_id)
    .single();

  // Strip the data URL prefix if the client sent one (data:image/jpeg;base64,...)
  let cleaned = image_base64;
  let mediaType = "image/jpeg";
  const m = image_base64.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (m) {
    mediaType = m[1];
    cleaned = m[2];
  }

  // Soft cap — Anthropic limits to 5MB per image. Reject early with a clear
  // message so the client knows to compress more.
  const approxBytes = Math.floor((cleaned.length * 3) / 4);
  if (approxBytes > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: `Image too large (${(approxBytes / 1024 / 1024).toFixed(1)}MB). Try a smaller photo.` },
      { status: 413 }
    );
  }

  const cfg = await getAIConfig();
  const validCategories = CATEGORIES.join(", ");
  const tripCurrencies = [
    "MYR",
    trip?.foreign_currency,
    trip?.foreign_currency_2,
  ].filter(Boolean).join(", ");

  const system = `You read a photo of a receipt and extract the totals as JSON.

Trip context:
- Destination: ${trip?.destination ?? "(unknown)"}
- Likely currencies: ${tripCurrencies}
${hint_currency ? `- User hinted currency: ${hint_currency}` : ""}

Return ONLY valid JSON in this shape (no markdown, no commentary):
{
  "amount": <number — the FINAL total paid, after tax/service charge if shown>,
  "currency": "<ISO code: MYR / JPY / USD / etc., best guess from receipt or trip context>",
  "date": "YYYY-MM-DD or null if not shown",
  "items": ["short item names, up to 5"],
  "suggested_category": "<one of: ${validCategories}>",
  "confidence": "high" | "medium" | "low",
  "raw_text": "the receipt's merchant/store name if visible, or short summary"
}

Rules:
- If multiple amounts shown (subtotal vs total vs tip), use the FINAL total.
- If the receipt is in Japanese / Chinese / Malay, still return English category.
- "confidence: low" if the image is blurry, partial, or you're guessing.
- If you can't read a key field, return null for that field. Don't invent.
- Tax-inclusive total preferred over pre-tax subtotal.
- For currency: if the receipt clearly shows ¥ → JPY. RM → MYR. $ → USD or trip's default.`;

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
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: cleaned,
                },
              },
              {
                type: "text",
                text: "Read this receipt and return the JSON described in the system prompt. Nothing else.",
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const mapped = mapUpstreamError(res.status, await res.text().catch(() => ""));
      console.error("[ai/parse-receipt]", mapped.technical);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return NextResponse.json({ error: "AI returned no JSON", raw: text }, { status: 500 });
    }

    let parsed;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch (e) {
      return NextResponse.json({ error: "AI returned malformed JSON", raw: text }, { status: 500 });
    }

    // Validate + normalise. We're forgiving here: missing fields default to
    // safe values so the client can still pre-fill what's there.
    const amount = typeof parsed.amount === "number" ? parsed.amount : Number(parsed.amount) || null;
    const currency = typeof parsed.currency === "string" ? parsed.currency.toUpperCase() : null;
    const date = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 5).map(String) : [];
    const suggested_category = CATEGORIES.includes(parsed.suggested_category) ? parsed.suggested_category : "Others";
    const confidence = ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium";
    const raw_text = typeof parsed.raw_text === "string" ? parsed.raw_text.slice(0, 200) : "";

    return NextResponse.json({
      amount,
      currency,
      date,
      items,
      suggested_category,
      confidence,
      raw_text,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
