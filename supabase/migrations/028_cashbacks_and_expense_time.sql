-- Manual cashback ledger + optional per-expense time.
--
-- CASHBACK: friends pay with cards (e.g. Ryt) that credit cashback to the PAYER
-- later. The amount is entered MANUALLY per expense ("type it if available") and
-- credited to that expense's payer. It is a pure side-ledger — it NEVER touches
-- the expense's splits or the settlement math. Each entry can be ticked
-- received (pending -> completed) and filtered per traveller so everyone can see
-- their own pending vs received cashback.
--
-- Modelled as its own table (linked by expense_id) rather than columns on
-- `expenses`, so the money-critical expenses/splits write path stays untouched.
create table if not exists cashbacks (
  id           uuid        primary key default gen_random_uuid(),
  trip_id      uuid        not null references trips(id) on delete cascade,
  expense_id   uuid        not null references expenses(id) on delete cascade,
  traveler_id  uuid        not null references travelers(id) on delete cascade,
  amount       numeric     not null,
  received     boolean     not null default false,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_cashbacks_trip on cashbacks (trip_id);
create index if not exists idx_cashbacks_expense on cashbacks (expense_id);
create index if not exists idx_cashbacks_traveler on cashbacks (traveler_id);

-- Service-role only — the app reads/writes via serverDb() in /api/cashback.
-- (RLS on with no policies = locked to the service role, matching activity_log.)
alter table cashbacks enable row level security;

-- Optional per-expense time of day (text "HH:MM", 24h). Existing rows stay NULL
-- and fall back to created_at for ordering. New expenses default to the live
-- time when the user doesn't pick one.
alter table expenses add column if not exists time text;
