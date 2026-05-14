import { serverDb } from "./supabase";

// Resolved AI configuration. baseURL is the Anthropic-compatible host.
// apiKey is what goes into the x-api-key header. Both prefer the DB override
// (set via Dev tab → Token Manager) over the deploy-time env var so the owner
// can rotate to a fresh key when one hits its usage cap without redeploying.
export type AIConfig = {
  apiKey: string;
  baseURL: string;
  messagesUrl: string; // convenience: full POST url for /v1/messages
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
    const { data } = await db
      .from("app_settings")
      .select("anthropic_api_key, claude_proxy_url")
      .eq("id", 1)
      .single();
    dbKey = data?.anthropic_api_key ?? null;
    dbProxy = data?.claude_proxy_url ?? null;
  } catch {
    // Table may not exist yet (migration not run) — silently fall back to env.
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

// Mask a secret for display: "sk-ant-api03-...AbCd" — never returns the raw value.
export function maskSecret(secret: string | null | undefined): string {
  if (!secret || secret.length === 0) return "(not set)";
  if (secret.length <= 12) return "•".repeat(secret.length);
  return `${secret.slice(0, 10)}…${secret.slice(-4)}`;
}
