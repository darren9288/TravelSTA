-- Notification frequency: per-user, per-trip preferences for how often
-- push notifications are delivered. Combined with a queue table that buffers
-- pushes between flushes.
--
-- Three tiers:
--   0  = Frequent   → send immediately (current default behavior)
--   1  = Medium     → coalesce every 1 minute into a single summary push
--   5  = Low        → coalesce every 5 minutes into a single summary push
--   -1 = Off        → skip non-anomaly pushes entirely (anomalies still send)
--
-- Anomalies (duplicate, overdraft, etc.) ALWAYS bypass the queue and go
-- immediately, regardless of preference. The whole point of anomaly alerts
-- is to surface problems fast.

create table if not exists user_notification_preferences (
  user_id    uuid       not null references auth.users(id) on delete cascade,
  trip_id    uuid       not null references trips(id) on delete cascade,
  interval_minutes int   not null default 0
    check (interval_minutes in (-1, 0, 1, 5)),
  updated_at timestamptz not null default now(),
  primary key (user_id, trip_id)
);

comment on column user_notification_preferences.interval_minutes is
  '0 = Frequent (immediate), 1 = Medium (1-min batch), 5 = Low (5-min batch), -1 = Off (anomalies only)';

-- Buffered pushes waiting to be coalesced and sent. The cron job flushes
-- rows whose age >= the user's interval, groups them per (user_id, trip_id),
-- builds a summary push, sends it, and marks the rows delivered.
create table if not exists notification_queue (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  trip_id      uuid        references trips(id) on delete cascade,
  payload      jsonb       not null,  -- the original PushPayload { title, body, url, tag }
  category     text        not null,  -- 'expense_add' | 'expense_delete' | 'split_toggle' | 'pool_topup' | 'wallet_topup' | 'itinerary_add' | 'settle_all' | 'anomaly' | 'other'
  created_at   timestamptz not null default now(),
  delivered_at timestamptz             -- null = pending; set when included in a flushed batch
);

-- Hot index for the cron job: "find undelivered items per user."
create index if not exists idx_notification_queue_pending
  on notification_queue (user_id, created_at)
  where delivered_at is null;

-- RLS: only the user themselves can read their own preferences/queue.
-- Service role bypasses RLS so the cron job can flush.
alter table user_notification_preferences enable row level security;
alter table notification_queue enable row level security;

drop policy if exists "own prefs read" on user_notification_preferences;
create policy "own prefs read"
  on user_notification_preferences for select
  using (user_id = auth.uid());

drop policy if exists "own prefs upsert" on user_notification_preferences;
create policy "own prefs upsert"
  on user_notification_preferences for insert
  with check (user_id = auth.uid());

drop policy if exists "own prefs update" on user_notification_preferences;
create policy "own prefs update"
  on user_notification_preferences for update
  using (user_id = auth.uid());

drop policy if exists "own queue read" on notification_queue;
create policy "own queue read"
  on notification_queue for select
  using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- pg_cron setup (run separately in Supabase SQL editor)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enable extensions (one-time, in Supabase dashboard → Database → Extensions):
--      - pg_cron
--      - pg_net
--
-- 2. Create the cron job that calls your /api/cron/flush-notifications endpoint:
--
--    SELECT cron.schedule(
--      'flush-notification-queue',
--      '* * * * *',  -- every minute
--      $$
--      SELECT net.http_post(
--        url := 'https://YOUR_APP.vercel.app/api/cron/flush-notifications',
--        headers := jsonb_build_object(
--          'Authorization', 'Bearer ' || current_setting('app.cron_secret', true),
--          'Content-Type', 'application/json'
--        ),
--        body := '{}'::jsonb
--      ) AS request_id;
--      $$
--    );
--
-- 3. Set the cron secret as a Postgres setting (one-time):
--      ALTER DATABASE postgres SET app.cron_secret = 'YOUR_RANDOM_SECRET';
--    Also add CRON_SECRET=YOUR_RANDOM_SECRET to your Vercel env vars.
--
-- 4. To unschedule later if needed:
--      SELECT cron.unschedule('flush-notification-queue');
