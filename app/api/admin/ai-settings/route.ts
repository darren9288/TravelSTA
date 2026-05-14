export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireSuperAdmin } from "@/lib/admin";
import { getSessionUser } from "@/lib/supabase-server";
import { invalidateAIConfigCache, maskSecret } from "@/lib/ai-config";

// GET /api/admin/ai-settings
// Returns the current AI token config:
// - Masked DB override values (so the raw secret never leaves the server)
// - Whether each value is sourced from db or env
// - Tail-only fingerprint of the effective key so the owner can confirm
//   which key is currently active.
//
// PUT /api/admin/ai-settings
// Body: { anthropic_api_key?: string | null, claude_proxy_url?: string | null }
// - Passing a non-empty string sets the override.
// - Passing null (or "") clears the override and falls back to the env var.

export async function GET() {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const db = serverDb();
  const { data, error } = await db
    .from("app_settings")
    .select("anthropic_api_key, claude_proxy_url, updated_at, updated_by")
    .eq("id", 1)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dbKey: string | null = data?.anthropic_api_key ?? null;
  const dbProxy: string | null = data?.claude_proxy_url ?? null;

  const envKey = process.env.ANTHROPIC_API_KEY ?? "";
  const envProxy = process.env.CLAUDE_PROXY_URL ?? "https://api.anthropic.com";

  const effectiveKey = dbKey && dbKey.trim().length > 0 ? dbKey : envKey;
  const effectiveProxy = dbProxy && dbProxy.trim().length > 0 ? dbProxy : envProxy;

  // Look up who last updated, if any.
  let updatedByName: string | null = null;
  if (data?.updated_by) {
    const { data: prof } = await db
      .from("profiles")
      .select("username")
      .eq("id", data.updated_by)
      .single();
    updatedByName = prof?.username ?? null;
  }

  return NextResponse.json({
    // Masked / safe-to-display values
    anthropic_api_key_masked: maskSecret(effectiveKey),
    claude_proxy_url: effectiveProxy,
    // Source flags — tells UI whether the override is active
    key_source: dbKey && dbKey.trim().length > 0 ? "db" : "env",
    proxy_source: dbProxy && dbProxy.trim().length > 0 ? "db" : "env",
    // Whether each is set at all (env or db)
    has_key: effectiveKey.length > 0,
    // Metadata
    updated_at: data?.updated_at ?? null,
    updated_by: updatedByName,
  });
}

export async function PUT(req: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const rawKey = body.anthropic_api_key;
  const rawProxy = body.claude_proxy_url;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Treat undefined as "don't touch", null / empty string as "clear override".
  if (rawKey !== undefined) {
    if (rawKey === null || (typeof rawKey === "string" && rawKey.trim() === "")) {
      update.anthropic_api_key = null;
    } else if (typeof rawKey === "string") {
      // Light sanity check — Anthropic keys start with sk-ant-. Don't hard-fail
      // because proxy URLs may use any token shape, but warn-via-status.
      if (rawKey.length < 20) {
        return NextResponse.json(
          { error: "Token looks too short. Paste the full key including the sk-ant- prefix." },
          { status: 400 }
        );
      }
      update.anthropic_api_key = rawKey.trim();
    }
  }

  if (rawProxy !== undefined) {
    if (rawProxy === null || (typeof rawProxy === "string" && rawProxy.trim() === "")) {
      update.claude_proxy_url = null;
    } else if (typeof rawProxy === "string") {
      // Validate URL shape — easy to typo.
      try {
        // eslint-disable-next-line no-new
        new URL(rawProxy.trim());
      } catch {
        return NextResponse.json(
          { error: "Proxy URL is not a valid URL (e.g. https://api.anthropic.com)." },
          { status: 400 }
        );
      }
      update.claude_proxy_url = rawProxy.trim();
    }
  }

  // Stamp the actor for audit visibility.
  const me = await getSessionUser();
  if (me) update.updated_by = me.id;

  const db = serverDb();
  const { error } = await db.from("app_settings").update(update).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateAIConfigCache();
  return NextResponse.json({ success: true });
}
