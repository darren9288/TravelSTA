export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireSuperAdmin } from "@/lib/admin";

// POST /api/admin/ai-tokens/test
// Body: { id: string }    Test a saved token by sending a minimal ping.
// Returns: { success: boolean, latency_ms: number, error?: string }
// Side effect: updates app_tokens.last_tested_at / last_test_result on the row.

const DEFAULT_PROXY = "https://api.anthropic.com";

export async function POST(req: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const id: string | undefined = body.id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = serverDb();
  const { data: token } = await db
    .from("app_tokens")
    .select("anthropic_api_key, claude_proxy_url")
    .eq("id", id)
    .single();
  if (!token?.anthropic_api_key) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  const baseURL = token.claude_proxy_url || DEFAULT_PROXY;
  const url = baseURL.endsWith("/v1") ? `${baseURL}/messages` : `${baseURL}/v1/messages`;

  const start = Date.now();
  let success = false;
  let errMsg: string | null = null;

  try {
    // Tiniest possible Anthropic call: 5 token cap, one-word prompt.
    const res = await fetch(url, {
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
    if (!res.ok) {
      const text = await res.text();
      errMsg = `${res.status}: ${text.slice(0, 200)}`;
    } else {
      success = true;
    }
  } catch (e) {
    errMsg = (e as Error).message;
  }

  const latency = Date.now() - start;

  // Stamp the result so the table shows a per-row status without re-testing.
  await db
    .from("app_tokens")
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_result: success ? "success" : "fail",
      last_test_error: errMsg,
      last_test_latency_ms: latency,
    })
    .eq("id", id);

  return NextResponse.json({
    success,
    latency_ms: latency,
    error: errMsg,
  });
}
