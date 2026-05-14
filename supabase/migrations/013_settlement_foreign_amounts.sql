-- Freeze the foreign-currency amount of each settlement payment at the moment
-- it was recorded. Previously the wallet-history view multiplied the stored
-- MYR amount by the *current* trip rate, which meant changing cash_rate or
-- wise_rate retroactively changed how past JPY settlements were displayed.
--
-- We store two values because the from_wallet and to_wallet may use different
-- conversion rates (e.g. JPY Wise → JPY Cash crosses a rate boundary).
--
-- Legacy rows (created before this migration) leave these columns NULL; the
-- read path falls back to the old `amount * current_rate` behaviour for those.

alter table settlement_payments add column if not exists from_foreign_amount numeric;
alter table settlement_payments add column if not exists to_foreign_amount numeric;
