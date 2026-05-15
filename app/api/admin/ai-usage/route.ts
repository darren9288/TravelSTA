export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { requireSuperAdmin } from "@/lib/admin";
import { estimateUsdCost } from "@/lib/ai-usage";

// GET /api/admin/ai-usage
// Super-admin only. Returns aggregated usage stats:
//   - current_month: { calls, input_tokens, output_tokens, est_usd }
//   - all_time:      { calls, input_tokens, output_tokens, est_usd }
//   - last_30_days:  [{ date, calls, input_tokens, output_tokens, est_usd }]
//   - by_route:      [{ route, calls, input_tokens, output_tokens, est_usd }]
//
// All numbers are exact from Anthropic's usage field. Only est_usd is
// approximate (uses standard Sonnet 4 pricing — your proxy may differ).

type LogRow = {
  route: string;
  input_tokens: number;
  output_tokens: number;
  model: string;
  created_at: string;
};

export async function GET() {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const db = serverDb();
  const { data: rows, error } = await db
    .from("ai_usage_log")
    .select("route, input_tokens, output_tokens, model, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const all = (rows ?? []) as LogRow[];

  // ── Helpers ────────────────────────────────────────────────────────────
  function summarize(subset: LogRow[]) {
    let input = 0, output = 0, est = 0;
    for (const r of subset) {
      input += r.input_tokens;
      output += r.output_tokens;
      est += estimateUsdCost(r.model, r.input_tokens, r.output_tokens);
    }
    return {
      calls: subset.length,
      input_tokens: input,
      output_tokens: output,
      est_usd: Number(est.toFixed(4)),
    };
  }

  // Current month: first day of this month → now (UTC).
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const thisMonth = all.filter((r) => r.created_at >= monthStart);

  // Last 30 days, grouped by date (YYYY-MM-DD).
  const dayBuckets: Record<string, LogRow[]> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    dayBuckets[key] = [];
  }
  for (const r of all) {
    const key = r.created_at.slice(0, 10);
    if (dayBuckets[key]) dayBuckets[key].push(r);
  }
  const last_30_days = Object.entries(dayBuckets).map(([date, subset]) => ({
    date,
    ...summarize(subset),
  }));

  // By route.
  const routeBuckets: Record<string, LogRow[]> = {};
  for (const r of all) {
    (routeBuckets[r.route] ||= []).push(r);
  }
  const by_route = Object.entries(routeBuckets)
    .map(([route, subset]) => ({ route, ...summarize(subset) }))
    .sort((a, b) => b.calls - a.calls);

  return NextResponse.json({
    current_month: summarize(thisMonth),
    all_time: summarize(all),
    last_30_days,
    by_route,
  });
}
