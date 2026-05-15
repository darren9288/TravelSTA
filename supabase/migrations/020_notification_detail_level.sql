-- Notification detail level — sub-preference for how coalesced (batched)
-- notifications are formatted.
--
--   'summary'  → counts only:        "• 2 expenses added, 3 splits settled"
--   'detailed' → bullet list each:   "• RM 50 · Lunch\n• RM 80 · Dinner\n..."
--
-- Only relevant when interval_minutes > 0 (Medium / Low). When Frequent
-- (0) or Off (-1), every event is sent as its own detailed push or not at all.

alter table user_notification_preferences
  add column if not exists detail_level text not null default 'summary'
    check (detail_level in ('summary', 'detailed'));

comment on column user_notification_preferences.detail_level is
  '''summary'' (counts) or ''detailed'' (bullet list of each event) — only used when interval_minutes > 0';
