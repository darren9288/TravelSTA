import { serverDb } from "./supabase";

// Fire-and-forget logger for Claude API calls. Anthropic returns exact
// token counts in the response's `usage` field, so we don't have to
// estimate — we read them straight off.
//
// Wrapped in try/catch so a logging failure can never break the actual
// AI request. Called AFTER a successful response so we don't pollute the
// stats with rate-limit errors etc.
//
// Usage:
//   const data = await res.json();
//   void logAIUsage("ask", data, { userId: me?.id, tripId });

type ClaudeResponse = {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  model?: string;
};

type LogContext = {
  userId?: string | null;
  tripId?: string | null;
  appTokenId?: string | null;
};

export async function logAIUsage(
  route: string,
  response: ClaudeResponse,
  context: LogContext = {}
): Promise<void> {
  try {
    const u = response?.usage;
    if (!u) return; // No usage data — nothing to log.

    const input = Number(u.input_tokens ?? 0);
    const output = Number(u.output_tokens ?? 0);
    if (input === 0 && output === 0) return; // Skip empty rows.

    const db = serverDb();
    await db.from("ai_usage_log").insert({
      route,
      input_tokens: input,
      output_tokens: output,
      model: response.model ?? "claude-sonnet-4-6",
      user_id: context.userId ?? null,
      trip_id: context.tripId ?? null,
      app_token_id: context.appTokenId ?? null,
    });
  } catch (e) {
    // Never throw — the AI request already completed successfully and the
    // user is waiting on the response. Logging is best-effort.
    console.error("[ai-usage]", (e as Error).message);
  }
}

// ── Cost estimation (USD) ────────────────────────────────────────────────
// Anthropic Claude Sonnet 4 pricing as of late 2025 (subject to change).
// Mirbuds AI proxy adds markup on top, so this is a lower bound for users
// going through them. Still useful as a "is my key bleeding?" signal.
const PRICING_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  // Fallback used when model field is missing or unrecognized.
  default: { input: 3, output: 15 },
};

export function estimateUsdCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICING_PER_M_TOKENS[model] ?? PRICING_PER_M_TOKENS["default"];
  const inUsd = (inputTokens / 1_000_000) * price.input;
  const outUsd = (outputTokens / 1_000_000) * price.output;
  return inUsd + outUsd;
}
