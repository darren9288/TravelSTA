-- Soft-delete flag for travelers (and pools, since pools are travelers with
-- is_pool=true). Archived travelers are hidden from selection UIs — "Paid by"
-- dropdowns, even-split calculations, new pool top-up forms — but their
-- existing data (expenses, splits, history) is preserved.
--
-- Settlement still counts unsettled splits belonging to archived travelers,
-- so they can never "escape" outstanding debts by being archived.

alter table travelers add column if not exists archived boolean not null default false;

-- Partial index for the common "active only" query path.
create index if not exists travelers_active_idx on travelers(trip_id) where archived = false;
