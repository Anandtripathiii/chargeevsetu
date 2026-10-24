-- Private bucket for team photos shown on the admin About page. Run in Supabase -> SQL Editor. Safe to re-run.
-- Nobody can list or read these files with the publishable/anon key or as a logged-in user: there is deliberately
-- NO select policy for anon/authenticated. Only the service role (server-side /api/admin/team-photo) can read them,
-- and it hands the browser a signed URL that expires after 10 minutes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-photos', 'team-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- make sure no older broad policy exposes this bucket
drop policy if exists "team photos read" on storage.objects;
drop policy if exists "team photos public" on storage.objects;
-- The existing policies in 20261025_security.sql only cover 'report-photos' and 'charger-photos', so with RLS on
-- storage.objects every anon/authenticated request for 'team-photos' is denied. Uploads happen with the service role.
