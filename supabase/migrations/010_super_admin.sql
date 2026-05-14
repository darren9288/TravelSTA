-- Super admin flag — owner can manage users + trips across the whole app.
-- Set manually in Supabase: update profiles set is_super_admin = true where username = '<your-username>';

alter table profiles add column if not exists is_super_admin boolean not null default false;

create index if not exists profiles_super_admin_idx on profiles(is_super_admin) where is_super_admin = true;
