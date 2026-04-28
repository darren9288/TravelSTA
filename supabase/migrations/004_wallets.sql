-- Individual traveler wallets
create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  traveler_id uuid not null references travelers(id) on delete cascade,
  name text not null,
  currency text not null default 'MYR',
  created_at timestamptz not null default now()
);

-- Money added into a wallet
create table if not exists wallet_topups (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  amount numeric not null default 0,
  date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

-- Link expense to the wallet it was paid from
alter table expenses add column if not exists wallet_id uuid references wallets(id) on delete set null;

-- Link pool top-up to the wallet it came from
alter table pool_topups add column if not exists from_wallet_id uuid references wallets(id) on delete set null;

-- Indexes
create index if not exists wallets_trip_idx on wallets(trip_id);
create index if not exists wallets_traveler_idx on wallets(traveler_id);
create index if not exists wallet_topups_wallet_idx on wallet_topups(wallet_id);
create index if not exists expenses_wallet_idx on expenses(wallet_id);
create index if not exists pool_topups_from_wallet_idx on pool_topups(from_wallet_id);

-- RLS
alter table wallets enable row level security;
alter table wallet_topups enable row level security;
create policy "wallets_all" on wallets for all using (true) with check (true);
create policy "wallet_topups_all" on wallet_topups for all using (true) with check (true);
