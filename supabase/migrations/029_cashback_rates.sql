-- Configurable cashback rate presets per trip.
--
-- Replaces the hardcoded "Ryt -1.2%" auto-fill button on the Add Expense page
-- with a list the user manages in Trip Settings (e.g. Ryt 1.2%, TNG 3%, ...).
--
-- cashback_rates     : [{ "id": "ryt", "name": "Ryt", "percent": 1.2 }, ...]
-- cashback_active_id : which preset the auto-fill buttons currently use.
--
-- Both nullable. When null the app falls back to its built-in defaults, so the
-- feature degrades gracefully if this migration hasn't been run yet.
alter table trips add column if not exists cashback_rates jsonb;
alter table trips add column if not exists cashback_active_id text;
