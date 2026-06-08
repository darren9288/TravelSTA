-- Distinguish manually-locked splits from Settle-All-locked splits.
--
-- expense_splits.locked already drives the lock UI (a locked split can't be
-- toggled). But two very different things set it:
--   1. Settle All — also writes settlement_payments rows (the net transfers).
--      Unlocking these without reversing the payment corrupts the math.
--   2. Manual lock (new) — a user long-presses a settled split to freeze it.
--      No payment row exists, so unlocking is safe.
--
-- lock_source records which. The /api/splits unlock path only ever clears a
-- 'manual' lock — 'settle_all' locks stay frozen and must be managed from the
-- Settlement page.

alter table expense_splits
  add column if not exists lock_source text
    check (lock_source in ('settle_all', 'manual'));

comment on column expense_splits.lock_source is
  '''settle_all'' = locked by Settle All (has a settlement_payments row — do NOT unlock from the expense UI). ''manual'' = user long-press lock (safe to unlock). null = not locked.';

-- Backfill: every existing locked row was created by Settle All.
update expense_splits set lock_source = 'settle_all' where locked = true and lock_source is null;
