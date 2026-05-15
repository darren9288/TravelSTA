-- AI usage log — records every Claude API call so the Admin panel can
-- show per-month + per-route consumption.
--
-- Anthropic always returns exact token counts in the response's `usage`
-- field, so the numbers here are precise (not estimates). Only the dollar
-- conversion is approximate, because most users go through a proxy
-- (mirbuds AI) whose pricing/markup is opaque.
--
-- This table is fire-and-forget — a logging failure must never break
-- the actual AI request. RLS blocks normal users so they can't read
-- each other's usage; only the service role (admin endpoints) sees it.

create table if not exists ai_usage_log (
  id              uuid        primary key default gen_random_uuid(),
  route           text        not null,         -- 'ask' | 'parse-expense' | 'parse-receipt' | 'recap' | etc.
  input_tokens    int         not null default 0,
  output_tokens   int         not null default 0,
  model           text        not null default 'claude-sonnet-4-6',
  user_id         uuid        references auth.users(id) on delete set null,
  trip_id         uuid        references trips(id) on delete set null,
  -- The token row that powered this call (or null when env-var fallback was used).
  -- Useful for "which key burned through quota fastest" diagnostics.
  app_token_id    uuid        references app_tokens(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Common query: usage by day for the last 30 days, grouped by route.
create index if not exists idx_ai_usage_log_recent
  on ai_usage_log (created_at desc);

-- RLS: lock down so only the service role (admin endpoints + the logger
-- itself, which uses service role via serverDb()) can read or insert.
-- Normal users have no need to see usage data.
alter table ai_usage_log enable row level security;

-- No SELECT/INSERT policies — the service role bypasses RLS so the
-- logger and /api/admin/ai-usage endpoint can still operate. Absence
-- of policies means client-side queries return zero rows.
