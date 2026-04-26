function extractJSON(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON found in response");
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === "\\" && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    if (c === "}") { depth--; if (depth === 0) return JSON.parse(text.slice(start, i + 1)); }
  }
  throw new Error("Unbalanced JSON in response");
}

export type ParsedExpenseEntry = {
  description: string;
  category: string;
  foreign_amount: number | null;
  myr_amount: number | null;
};

export type ParsedExpenses = {
  date: string;
  entries: ParsedExpenseEntry[];
};

export async function parseExpenses(
  text: string,
  foreignCurrency: string,
  today: string
): Promise<ParsedExpenses> {
  const baseURL = process.env.CLAUDE_PROXY_URL ?? "https://api.anthropic.com";
  const url = baseURL.endsWith("/v1") ? `${baseURL}/messages` : `${baseURL}/v1/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `You are a travel expense parser. Extract date and expense entries from the user's text.
Return ONLY valid JSON:
{
  "date": "YYYY-MM-DD",
  "entries": [
    {
      "description": "string",
      "category": "one of: Activity|Breakfast|Lunch|Dinner|Small Eat|Entertainment|Others|Souvenirs|Supplies|Laundry|Hotel|Flight|Transport|Car Rental|Fuel|Travel Related",
      "foreign_amount": number or null,
      "myr_amount": number or null
    }
  ]
}
Rules:
- If no date given, use today: ${today}
- If amounts are in ${foreignCurrency} (numbers without RM), set foreign_amount and leave myr_amount null
- If amounts clearly have RM prefix, set myr_amount and leave foreign_amount null
- Pick the most fitting category
- Return ONLY JSON`,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = data.content?.[0];
  if (!content || content.type !== "text") throw new Error("Unexpected response");
  return extractJSON(content.text) as ParsedExpenses;
}
