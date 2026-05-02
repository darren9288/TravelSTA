-- Add currency field to expenses table
-- Each expense now stores which currency it was paid in (MYR, or one of the trip's foreign currencies)

ALTER TABLE expenses
ADD COLUMN currency TEXT NOT NULL DEFAULT 'MYR';

-- Add comment explaining the currency field
COMMENT ON COLUMN expenses.currency IS 'Currency code for this expense (MYR, or one of the trip foreign currencies). Determines which exchange rate to use.';
