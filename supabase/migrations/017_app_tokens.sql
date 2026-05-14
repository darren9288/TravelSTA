-- Multi-token support. The old single-row override in app_settings worked
-- but you couldn't prepare backups — when a key hit its cap, you had to
-- find another one in your notes, paste it in, and hope it worked.
--
-- This table lets the owner pre-stage a list of tokens and flip between
-- them with one click. app_settings.active_token_id points at the row in
-- app_tokens that's currently live; lib/ai-config.ts joins on it.

create table if not exists app_tokens (
  id                uuid primary key default gen_random_uuid(),
  label             text,                          -- optional human note: "Mirbuds account 1", "Personal key"
  anthropic_api_key text not null,
  claude_proxy_url  text,                          -- null = default to https://api.anthropic.com
  last_tested_at    timestamptz,
  last_test_result  text,                          -- 'success' | 'fail' | null
  last_test_error   text,                          -- truncated upstream error when last_test_result = 'fail'
  last_test_latency_ms int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null
);

-- Pointer to the active token. Nullable — when null, falls back to env vars.
alter table app_settings add column if not exists active_token_id uuid references app_tokens(id) on delete set null;

-- Migrate the existing singleton override (if any) so the upgrade isn't lossy.
do $$
declare
  v_key text;
  v_proxy text;
  v_new_id uuid;
begin
  select anthropic_api_key, claude_proxy_url
    into v_key, v_proxy
    from app_settings where id = 1;

  if v_key is not null and length(btrim(v_key)) > 0 then
    insert into app_tokens (label, anthropic_api_key, claude_proxy_url)
      values ('Migrated', v_key, v_proxy)
      returning id into v_new_id;
    update app_settings set active_token_id = v_new_id where id = 1;
    -- Null out the legacy columns — single source of truth is app_tokens now.
    update app_settings set anthropic_api_key = null, claude_proxy_url = null where id = 1;
  end if;
end $$;

alter table app_tokens enable row level security;
drop policy if exists "app_tokens_no_client" on app_tokens;
create policy "app_tokens_no_client" on app_tokens
  for all using (false) with check (false);
