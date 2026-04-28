-- Track which wallets were used when settling a split
alter table expense_splits add column if not exists from_wallet_id uuid references wallets(id) on delete set null;
alter table expense_splits add column if not exists to_wallet_id uuid references wallets(id) on delete set null;
