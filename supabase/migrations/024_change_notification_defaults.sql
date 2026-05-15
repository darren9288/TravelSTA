-- Change default notification preferences from Frequent/Summary to Medium/Detailed.
--
-- Why:
--   - Frequent (every event = 1 push) is too noisy in practice — adding 3
--     expenses + ticking 2 splits = 5 banners in a minute.
--   - Summary ("3 expenses added") doesn't tell you WHAT was added, so you
--     end up opening the app anyway.
--
-- Medium (1-min batch) + Detailed bullets gives the right trade-off:
-- one push per minute, with enough detail to know if you need to act.
--
-- This only affects FUTURE rows. Existing rows keep whatever the user
-- explicitly chose (0/summary if they ever tapped a tile). Users without
-- a row at all (the common case for v1 users) get the new defaults at
-- runtime via the code's fallback logic.

alter table user_notification_preferences
  alter column interval_minutes set default 1;

alter table user_notification_preferences
  alter column detail_level set default 'detailed';
