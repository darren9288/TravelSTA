-- TravelSTA tables (run in Supabase SQL Editor)

create extension if not exists "pgcrypto";

-- Trips
create table trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  destination text not null default '',
  start_date date,
  end_date date,
  foreign_currency text not null default 'JPY',
  cash_rate numeric not null default 1,
  wise_rate numeric not null default 1,
  join_code text unique not null,
  created_at timestamptz not null default now()
);

-- Travelers (real people + virtual pools)
create table travelers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  is_pool boolean not null default false,
  pool_currency text,
  created_at timestamptz not null default now()
);

-- Expenses
create table expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  date date not null,
  category text not null,
  split_type text not null default 'even',
  paid_by_id uuid not null references travelers(id),
  payment_type text not null default 'Cash',
  foreign_amount numeric,
  myr_amount numeric not null,
  notes text,
  created_by_id uuid references travelers(id),
  created_at timestamptz not null default now()
);

-- Expense splits
create table expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  traveler_id uuid not null references travelers(id) on delete cascade,
  amount numeric not null,
  is_settled boolean not null default false
);

-- Pool top-ups
create table pool_topups (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  pool_id uuid not null references travelers(id),
  contributed_by_id uuid not null references travelers(id),
  myr_amount numeric not null default 0,
  foreign_amount numeric,
  date date not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Indexes
create index expenses_trip_idx on expenses(trip_id, date desc);
create index splits_expense_idx on expense_splits(expense_id);
create index splits_traveler_idx on expense_splits(traveler_id);
create index travelers_trip_idx on travelers(trip_id);

-- RLS
alter table trips enable row level security;
alter table travelers enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;
alter table pool_topups enable row level security;

create policy "allow_all_trips" on trips for all using (true) with check (true);
create policy "allow_all_travelers" on travelers for all using (true) with check (true);
create policy "allow_all_expenses" on expenses for all using (true) with check (true);
create policy "allow_all_splits" on expense_splits for all using (true) with check (true);
create policy "allow_all_topups" on pool_topups for all using (true) with check (true);
