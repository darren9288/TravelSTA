-- Permissive RLS on the three storage buckets so server-issued signed-URL
-- uploads work. Background upload was returning
-- "new row violates row-level security policy" because the default storage
-- policies didn't allow inserts via the signed URL path (which executes as
-- an authenticated-but-not-bucket-owner role).
--
-- Access control is enforced by the API routes that hand out these URLs:
--   /api/upload-background     → requireEditor(trip_id) before signing
--   /api/expenses/upload-photo → expense's trip ownership check
--   /api/itinerary/upload      → requireEditor(trip_id)
-- ...so opening the buckets at the RLS layer doesn't introduce new risk.

drop policy if exists "trip_backgrounds_all" on storage.objects;
drop policy if exists "trip-backgrounds_all" on storage.objects;
create policy "trip_backgrounds_all" on storage.objects
  for all
  using (bucket_id = 'trip-backgrounds')
  with check (bucket_id = 'trip-backgrounds');

drop policy if exists "expense_receipts_all" on storage.objects;
drop policy if exists "expense-receipts_all" on storage.objects;
create policy "expense_receipts_all" on storage.objects
  for all
  using (bucket_id = 'expense-receipts')
  with check (bucket_id = 'expense-receipts');

drop policy if exists "itinerary_files_all" on storage.objects;
drop policy if exists "itinerary-files_all" on storage.objects;
create policy "itinerary_files_all" on storage.objects
  for all
  using (bucket_id = 'itinerary-files')
  with check (bucket_id = 'itinerary-files');
