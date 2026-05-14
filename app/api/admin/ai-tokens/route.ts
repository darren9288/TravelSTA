export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireSuperAdmin } from "@/lib/admin";
import { getSessionUser } from "@/lib/supabase-server";
import { invalidateAIConfigCache, maskSecret, getAIConfig } from "@/lib/ai-config";

// GET /api/admin/ai-tokens
// Returns every saved token (masked) + which one is active.
// POST /api/admin/ai-tokens — body: { label?, anthropic_api_key, claude_proxy_url? }
//   Adds a new token to the list. Doesn't auto-activate — admin clicks "Use" to flip.
// PUT /api/admin/ai-tokens — body: { id }    Activates a token (sets app_settings.active_token_id).
// DELETE /api/admin/ai-tokens?id=... — removes a token. If it was active, clears active_token_id.

const DEFAULT_PROXY = "https://api.anthropic.com";

export async function GET() {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const db = serverDb();
  const [{ data: tokens, error: tokErr }, { data: settings }] = await Promise.all([
    db
      .from("app_tokens")
      .select(
        "id, label, anthropic_api_key, claude_proxy_url, last_tested_at, last_test_result, last_test_error, last_test_latency_ms, created_at"
      )
      .order("created_at", { ascending: false }),
    db.from("app_settings").select("active_token_id").eq("id", 1).single(),
  ]);

  if (tokErr) return NextResponse.json({ error: tokErr.message }, { status: 500 });

  const activeId = settings?.active_token_id ?? null;
  const masked = (tokens ?? []).map((t) => ({
    id: t.id,
    label: t.label,
    anthropic_api_key_masked: maskSecret(t.anthropic_api_key),
    claude_proxy_url: t.claude_proxy_url || DEFAULT_PROXY,
    is_active: t.id === activeId,
    last_tested_at: t.last_tested_at,
    last_test_result: t.last_test_result,
    last_test_error: t.last_test_error,
    last_test_latency_ms: t.last_test_latency_ms,
    created_at: t.created_at,
  }));

  // Ground truth: what would the AI routes actually use right now?
  // Bypass the cache so the UI shows the live resolved value, not stale.
  invalidateAIConfigCache();
  const effective = await getAIConfig();

  return NextResponse.json({
    tokens: masked,
    active_id: activeId,
    effective: {
      source: effective.source.apiKey,           // "db" | "env"
      key_masked: maskSecret(effective.apiKey),
      base_url: effective.baseURL,
    },
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const key: string | undefined = body.anthropic_api_key;
  const proxy: string | undefined = body.claude_proxy_url;
  const label: string | undefined = body.label;

  if (!key || typeof key !== "string" || key.trim().length < 20) {
    return NextResponse.json(
      { error: "Token looks too short — paste the full key (e.g. sk-ant-…)." },
      { status: 400 }
    );
  }

  if (proxy && typeof proxy === "string" && proxy.trim().length > 0) {
    try {
      // eslint-disable-next-line no-new
      new URL(proxy.trim());
    } catch {
      return NextResponse.json(
        { error: "Proxy URL is not a valid URL (e.g. https://api.anthropic.com)." },
        { status: 400 }
      );
    }
  }

  const me = await getSessionUser();
  const db = serverDb();
  const { data, error } = await db
    .from("app_tokens")
    .insert({
      label: label?.trim() || null,
      anthropic_api_key: key.trim(),
      claude_proxy_url: proxy?.trim() || null,
      updated_by: me?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, id: data?.id });
}

export async function PUT(req: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const id: string | null = body.id ?? null;
  // Skip the safety check when the caller explicitly forces. The UI uses
  // confirm() before sending force=true so an admin who really wants to
  // activate a failed token still can — they just have to ack the risk.
  const force: boolean = body.force === true;

  const db = serverDb();
  // null means deactivate everything (fall back to env vars). Always allowed.
  if (id) {
    const { data: token } = await db
      .from("app_tokens")
      .select("id, last_test_result, anthropic_api_key, claude_proxy_url")
      .eq("id", id)
      .maybeSingle();
    if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });

    // Block known-bad tokens. The client should run Test first, but defense-in-depth.
    if (!force && token.last_test_result === "fail") {
      return NextResponse.json(
        {
          error:
            "This token's last test failed. Test it again first, or pass { force: true } to override.",
          code: "TEST_FAILED",
        },
        { status: 400 }
      );
    }

    // Auto-test if never tested. Catches the obvious case where someone adds
    // a typo and immediately hits Use without testing.
    if (!force && token.last_test_result === null) {
      const proxy = token.claude_proxy_url || "https://api.anthropic.com";
      const url = proxy.endsWith("/v1") ? `${proxy}/messages` : `${proxy}/v1/messages`;
      const start = Date.now();
      let ok = false;
      let errMsg: string | null = null;
      try {
        const pingRes = await fetch(url, {
          method: "POST",
          headers: {
            "x-api-key": token.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 5,
            messages: [{ role: "user", content: "hi" }],
          }),
        });
        if (pingRes.ok) {
          ok = true;
        } else {
          errMsg = `${pingRes.status}: ${(await pingRes.text().catch(() => "")).slice(0, 200)}`;
        }
      } catch (e) {
        errMsg = (e as Error).message;
      }
      const latency = Date.now() - start;
      await db
        .from("app_tokens")
        .update({
          last_tested_at: new Date().toISOString(),
          last_test_result: ok ? "success" : "fail",
          last_test_error: errMsg,
          last_test_latency_ms: latency,
        })
        .eq("id", id);

      if (!ok) {
        return NextResponse.json(
          {
            error: `Auto-test failed before activating: ${errMsg}. Fix the token or pass force=true to override.`,
            code: "AUTO_TEST_FAILED",
          },
          { status: 400 }
        );
      }
    }
  }

  const me = await getSessionUser();
  const { error } = await db
    .from("app_settings")
    .update({
      active_token_id: id,
      updated_at: new Date().toISOString(),
      updated_by: me?.id ?? null,
    })
    .eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateAIConfigCache();
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = serverDb();
  // The FK on app_settings.active_token_id is ON DELETE SET NULL, so deletion
  // automatically clears the pointer if the active token is removed.
  const { error } = await db.from("app_tokens").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateAIConfigCache();
  return NextResponse.json({ success: true });
}
