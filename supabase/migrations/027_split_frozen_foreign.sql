-- Freeze the foreign-currency equivalent on per-split manual settles, the same
-- way settlement_payments already do (migration 013).
--
-- Without this, a per-split settle stores only the MYR amount + wallet ids, and
-- the wallet balance/history recompute the foreign value at the LIVE rate on
-- every read — so editing cash_rate/wise_rate later retroactively rewrites the
-- displayed JPY of an already-settled split. Storing the rate-at-settle-time
-- here makes those settles immutable, matching Settle All.
--
-- Both columns are nullable: MYR wallets / unsettled splits leave them null,
-- and legacy already-settled splits keep null (read paths fall back to the live
-- rate for those, exactly as before).

alter table expense_splits add column if not exists from_foreign_amount numeric;
alter table expense_splits add column if not exists to_foreign_amount numeric;
