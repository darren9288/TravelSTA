-- Add support for a second foreign currency per trip
-- Each trip can now have: MYR (base) + foreign_currency + foreign_currency_2 (optional)

ALTER TABLE trips
ADD COLUMN foreign_currency_2 TEXT,
ADD COLUMN cash_rate_2 NUMERIC(10, 4),
ADD COLUMN wise_rate_2 NUMERIC(10, 4);

-- Add comment explaining the currency system
COMMENT ON COLUMN trips.foreign_currency_2 IS 'Optional second foreign currency code (e.g., JPY). Can be NULL if trip only uses 2 currencies total.';
COMMENT ON COLUMN trips.cash_rate_2 IS 'Exchange rate for foreign_currency_2 when paying with cash (MYR per unit of foreign currency)';
COMMENT ON COLUMN trips.wise_rate_2 IS 'Exchange rate for foreign_currency_2 when paying with Wise (MYR per unit of foreign currency)';
