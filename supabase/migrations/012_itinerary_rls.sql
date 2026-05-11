-- Loosen RLS on itinerary_* tables so server-side inserts succeed.
-- Earlier migrations adopted the convention that the service role key bypasses
-- RLS and API routes enforce access via `requireEditor()` + trip_id filters.
-- The itinerary tables, created later, ended up with stricter policies that
-- reject inserts unless `auth.uid()` matches — which blocks the import API
-- because the server-side client doesn't carry an end-user session.

drop policy if exists "itinerary_items_select" on itinerary_items;
drop policy if exists "itinerary_items_insert" on itinerary_items;
drop policy if exists "itinerary_items_update" on itinerary_items;
drop policy if exists "itinerary_items_delete" on itinerary_items;
drop policy if exists "itinerary_items_all" on itinerary_items;

drop policy if exists "itinerary_links_select" on itinerary_links;
drop policy if exists "itinerary_links_insert" on itinerary_links;
drop policy if exists "itinerary_links_update" on itinerary_links;
drop policy if exists "itinerary_links_delete" on itinerary_links;
drop policy if exists "itinerary_links_all" on itinerary_links;

drop policy if exists "itinerary_files_select" on itinerary_files;
drop policy if exists "itinerary_files_insert" on itinerary_files;
drop policy if exists "itinerary_files_update" on itinerary_files;
drop policy if exists "itinerary_files_delete" on itinerary_files;
drop policy if exists "itinerary_files_all" on itinerary_files;

create policy "itinerary_items_all" on itinerary_items for all using (true) with check (true);
create policy "itinerary_links_all" on itinerary_links for all using (true) with check (true);
create policy "itinerary_files_all" on itinerary_files for all using (true) with check (true);
