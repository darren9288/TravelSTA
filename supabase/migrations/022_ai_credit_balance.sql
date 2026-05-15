-- AI credit balance — manual tracking of how much USD credit you have
-- left with your AI proxy (mirbuds AI, etc.). Anthropic doesn't expose a
-- "remaining" API, so users top this up by hand after buying a package
-- and the admin panel subtracts estimated spend to show a running
-- "remaining" figure.
--
-- Singleton column on app_settings — there's only one app, one credit
-- pool. The row was created by migration 016.

alter table app_settings
  add column if not exists ai_credit_balance_usd numeric(10, 2) not null default 0;

comment on column app_settings.ai_credit_balance_usd is
  'Total USD credit purchased on your AI proxy (mirbuds AI etc.). The admin panel subtracts estimated spend to show what is left.';
