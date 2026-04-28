-- Add created_at to expense_splits (missing from original schema)
alter table expense_splits add column if not exists created_at timestamptz not null default now();
