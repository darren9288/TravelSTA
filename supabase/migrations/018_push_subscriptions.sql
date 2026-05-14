-- Web Push subscription endpoints. One row per (user, device) pair.
-- When a user taps "Enable notifications" their browser hands us an
-- endpoint URL + crypto keys; we save those here so the server can later
-- fire pushes via web-push.
--
-- endpoint is the unique identifier (Google FCM URL on Android, Apple's
-- on iOS). p256dh + auth are the encryption keys the browser needs to
-- decrypt the message we send.
--
-- last_seen_at tracks the last time we successfully delivered to this
-- subscription, so dead rows can be pruned.

create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,                                  -- helps the user identify which device "iPhone Safari" vs "Chrome Desktop"
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  -- Same browser/install only ever has one row. If the user re-subscribes
  -- (e.g. after revoking + re-granting permission) the endpoint changes,
  -- so the unique constraint stays correct.
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

-- Direct client access is blocked — all reads/writes go through the API
-- routes that use the service-role client.
drop policy if exists "push_subscriptions_no_client" on push_subscriptions;
create policy "push_subscriptions_no_client" on push_subscriptions
  for all using (false) with check (false);
