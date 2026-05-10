-- Enable Postgres replication broadcasts for the tables our app subscribes to.
-- Tables must be members of the supabase_realtime publication for changes to
-- reach connected clients via WebSocket.

do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'trips',
    'travelers',
    'expenses',
    'expense_splits',
    'settlement_payments',
    'wallets',
    'wallet_topups',
    'pool_topups',
    'itinerary_items',
    'itinerary_links',
    'itinerary_files'
  ])
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', tbl);
    exception
      when duplicate_object then
        -- Already part of the publication; skip silently.
        null;
      when undefined_table then
        -- Table doesn't exist in this database; skip rather than abort.
        null;
    end;
  end loop;
end $$;
