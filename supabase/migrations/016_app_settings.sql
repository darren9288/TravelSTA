-- Global app settings (single-row table). Used by the Dev tab to override
-- the Anthropic API key at runtime so the project owner can swap to a fresh
-- token when one hits its monthly cap, without redeploying.
--
-- The row with id = 1 is the singleton. Env vars (CLAUDE_PROXY_URL,
-- ANTHROPIC_API_KEY) remain the fallback when the relevant column is null.
-- Only super admins can read/write this — enforced at the API route layer
-- (RLS is permissive because all writes go through the service-role client).

create table if not exists app_settings (
  id              int primary key default 1,
  anthropic_api_key text,         -- nullable; null = fall back to env var
  claude_proxy_url  text,         -- nullable; null = fall back to env var
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null,
  constraint app_settings_singleton check (id = 1)
);

-- Seed the singleton row so PUTs can update without UPSERT logic.
insert into app_settings (id) values (1)
  on conflict (id) do nothing;

alter table app_settings enable row level security;

-- Block direct client access entirely. All reads/writes go through API routes
-- that use the service-role client (which bypasses RLS) plus super-admin
-- checks in lib/admin.ts.
drop policy if exists "app_settings_no_client" on app_settings;
create policy "app_settings_no_client" on app_settings
  for all using (false) with check (false);
