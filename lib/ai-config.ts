import { serverDb } from "./supabase";

// Resolved AI configuration. baseURL is the Anthropic-compatible host.
// apiKey is what goes into the x-api-key header.
//
// Resolution order:
//   1. The token row pointed to by app_settings.active_token_id (if any).
//   2. Legacy singleton override in app_settings.anthropic_api_key (kept
//      working for safety, though migration 017 nulled it out).
//   3. The deploy-time env vars ANTHROPIC_API_KEY + CLAUDE_PROXY_URL.
export type AIConfig = {
  apiKey: string;
  baseURL: string;
  messagesUrl: string;
  source: { apiKey: "db" | "env"; baseURL: "db" | "env" };
};

// Cached for 30s so we don't hit the DB on every AI request.
let cache: { value: AIConfig; expires: number } | null = null;
const TTL_MS = 30_000;

export function invalidateAIConfigCache() {
  cache = null;
}

export async function getAIConfig(): Promise<AIConfig> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.value;

  let dbKey: string | null = null;
  let dbProxy: string | null = null;
  try {
    const db = serverDb();
    const { data: settings } = await db
      .from("app_settings")
      .select("active_token_id, anthropic_api_key, claude_proxy_url")
      .eq("id", 1)
      .single();

    if (settings?.active_token_id) {
      const { data: token } = await db
        .from("app_tokens")
        .select("anthropic_api_key, claude_proxy_url")
        .eq("id", settings.active_token_id)
        .single();
      if (token?.anthropic_api_key) {
        dbKey = token.anthropic_api_key;
        dbProxy = token.claude_proxy_url ?? null;
      }
    }

    // Legacy fallback for any data not yet migrated.
    if (!dbKey && settings?.anthropic_api_key) {
      dbKey = settings.anthropic_api_key;
      dbProxy = settings.claude_proxy_url ?? null;
    }
  } catch {
    // Tables may not exist yet — silently fall back to env.
  }

  const envKey = process.env.ANTHROPIC_API_KEY ?? "";
  const envProxy = process.env.CLAUDE_PROXY_URL ?? "https://api.anthropic.com";

  const apiKey = dbKey && dbKey.trim().length > 0 ? dbKey : envKey;
  const baseURL = dbProxy && dbProxy.trim().length > 0 ? dbProxy : envProxy;
  const messagesUrl = baseURL.endsWith("/v1")
    ? `${baseURL}/messages`
    : `${baseURL}/v1/messages`;

  const value: AIConfig = {
    apiKey,
    baseURL,
    messagesUrl,
    source: {
      apiKey: dbKey && dbKey.trim().length > 0 ? "db" : "env",
      baseURL: dbProxy && dbProxy.trim().length > 0 ? "db" : "env",
    },
  };
  cache = { value, expires: now + TTL_MS };
  return value;
}

// Mask a secret for display: "sk-ant-api…AbCd". Never returns the raw value.
export function maskSecret(secret: string | null | undefined): string {
  if (!secret || secret.length === 0) return "(not set)";
  if (secret.length <= 12) return "•".repeat(secret.length);
  return `${secret.slice(0, 10)}…${secret.slice(-4)}`;
}
