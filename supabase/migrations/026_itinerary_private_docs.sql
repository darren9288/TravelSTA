-- Private document attachments for itinerary items (boarding passes, hotel
-- confirmations, etc.). These are visible-but-locked to "pure viewers"
-- (people who joined "Just viewing" with no traveler identity): they see the
-- file name + a lock, but can't open the contents. Travelers + admins/editors
-- open them normally.
--
-- Cover photos stay in the existing PUBLIC 'itinerary-files' bucket (everyone
-- can see them). Documents go in this PRIVATE bucket.
--
-- Security model: this bucket is private AND has NO client-readable RLS
-- policy. The only way to read an object is a short-lived signed URL minted
-- server-side by /api/itinerary/file/[id] AFTER a traveler-identity check.
-- Uploads + signing run via the service role (serverDb), which bypasses RLS,
-- so they work without any permissive policy. A logged-in viewer therefore
-- cannot pull the object directly — there's no policy that would let them.

insert into storage.buckets (id, name, public)
values ('itinerary-docs', 'itinerary-docs', false)
on conflict (id) do nothing;

-- Track the storage path + privacy flag on each file record. Existing rows
-- default to is_private = false (legacy public files in itinerary-files),
-- so this only affects newly-uploaded documents going forward.
alter table itinerary_files add column if not exists storage_path text;
alter table itinerary_files add column if not exists is_private boolean not null default false;
