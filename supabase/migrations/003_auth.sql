-- Run this in Supabase SQL Editor

-- User profiles (username linked to auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now()
);

-- Trip members (who belongs to which trip + their role)
create table if not exists trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  traveler_id uuid references travelers(id),
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  unique(trip_id, user_id)
);

-- Track which user created each trip
alter table trips add column if not exists created_by_user_id uuid references auth.users(id);

-- Indexes
create index if not exists trip_members_user_idx on trip_members(user_id);
create index if not exists trip_members_trip_idx on trip_members(trip_id);
create index if not exists profiles_username_idx on profiles(username);

-- RLS (service role key bypasses these, but good practice)
alter table profiles enable row level security;
alter table trip_members enable row level security;

create policy "profiles_all" on profiles for all using (true) with check (true);
create policy "trip_members_all" on trip_members for all using (true) with check (true);
