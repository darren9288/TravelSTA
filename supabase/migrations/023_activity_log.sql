-- Activity log — records meaningful user actions and page navigation so
-- super admins can review what's been happening across the app.
--
-- "Every tap" would be too noisy and slow. Instead we log:
--   - Page views (which trip page someone opened)
--   - Server-side mutations (expense add/edit/delete, settle all, etc.)
--   - Auth events (sign in, sign out)
--   - Other meaningful interactions (e.g. AI Assistant queries)
--
-- This is enough to reconstruct "what did Mac do today" without burying
-- the admin in noise from every checkbox click.

create table if not exists activity_log (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users(id) on delete set null,
  trip_id     uuid        references trips(id) on delete set null,
  -- The action verb, e.g. 'page_view', 'expense_add', 'split_toggle',
  -- 'settle_all', 'sign_in', 'ai_ask'. Kept as text so adding new types
  -- doesn't need a migration.
  action      text        not null,
  -- Arbitrary JSON for context. For 'page_view' this is { path }.
  -- For 'expense_add' it's { expense_id, amount, category }, etc.
  details     jsonb       not null default '{}'::jsonb,
  -- Useful for forensics: which device/browser triggered the action.
  user_agent  text,
  ip          text,
  created_at  timestamptz not null default now()
);

-- Common query: recent activity sorted by time, often filtered by user or trip.
create index if not exists idx_activity_log_recent on activity_log (created_at desc);
create index if not exists idx_activity_log_user on activity_log (user_id, created_at desc);
create index if not exists idx_activity_log_trip on activity_log (trip_id, created_at desc);
create index if not exists idx_activity_log_action on activity_log (action, created_at desc);

-- RLS: only the service role reads/writes. Even regular users have no
-- need to see their own activity log — viewing is a super-admin feature.
alter table activity_log enable row level security;
