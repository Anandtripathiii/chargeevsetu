-- ChargeEVSetu security hardening. Run once in Supabase -> SQL Editor (after schema.sql). Safe to re-run.

-- ============ 1. RLS on every table (idempotent) ============
alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.home_chargers enable row level security;
alter table public.home_charger_private enable row level security;
alter table public.bookings enable row level security;
alter table public.install_requests enable row level security;
-- RLS applies to the table owner too (defence in depth for any future owner-role access)
alter table public.reviews force row level security;
alter table public.reports force row level security;
alter table public.home_chargers force row level security;
alter table public.home_charger_private force row level security;
alter table public.bookings force row level security;
alter table public.install_requests force row level security;

-- reviews: explicit WITH CHECK so a user can never move a review to another user
drop policy if exists "reviews own update" on public.reviews;
create policy "reviews own update" on public.reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- home chargers: hosts can only ever own their own rows
drop policy if exists "chargers host update" on public.home_chargers;
create policy "chargers host update" on public.home_chargers for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

-- bookings: the booker may only cancel; no other column may change (amount, time, charger …)
create or replace function public.bookings_only_cancel() returns trigger language plpgsql as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.status <> 'cancelled' or (new.id, new.charger_id, new.user_id, new.start_at, new.hours, new.amount, new.payment, new.created_at)
     is distinct from (old.id, old.charger_id, old.user_id, old.start_at, old.hours, old.amount, old.payment, old.created_at) then
    raise exception 'Only cancelling a booking is allowed' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists bookings_only_cancel on public.bookings;
create trigger bookings_only_cancel before update on public.bookings for each row execute function public.bookings_only_cancel();

-- install requests: nobody (not even the requester) can read them back; staff use the service role
drop policy if exists "install read" on public.install_requests;

-- functions: only logged-in users may book; nobody anonymous
revoke all on function public.book_charger(uuid, timestamptz, numeric) from public, anon;
grant execute on function public.book_charger(uuid, timestamptz, numeric) to authenticated;
revoke all on function public.booking_address(uuid) from public, anon;
grant execute on function public.booking_address(uuid) to authenticated;

-- There is no admin flag in any user-writable table. `verified` is protected by the keep_verified trigger
-- (schema.sql); admin access to /admin is a server-side password (middleware.ts), never a database role.

-- ============ 2. CHECK constraints ============
do $$ begin
  alter table public.reviews drop constraint if exists reviews_author_len;
  alter table public.reviews add constraint reviews_author_len check (char_length(author) between 1 and 100);
  alter table public.reviews drop constraint if exists reviews_body_len;
  alter table public.reviews add constraint reviews_body_len check (char_length(body) <= 1000);
  alter table public.reviews drop constraint if exists reviews_rating_range;
  alter table public.reviews add constraint reviews_rating_range check (rating between 1 and 5);
  alter table public.reviews drop constraint if exists reviews_station_len;
  alter table public.reviews add constraint reviews_station_len check (char_length(station_id) <= 64);

  alter table public.reports drop constraint if exists reports_note_len;
  alter table public.reports add constraint reports_note_len check (char_length(note) <= 1000);
  alter table public.reports drop constraint if exists reports_station_len;
  alter table public.reports add constraint reports_station_len check (char_length(station_id) <= 64);

  alter table public.home_chargers drop constraint if exists hc_host_name_len;
  alter table public.home_chargers add constraint hc_host_name_len check (char_length(host_name) between 1 and 100);
  alter table public.home_chargers drop constraint if exists hc_title_len;
  alter table public.home_chargers add constraint hc_title_len check (char_length(title) between 3 and 120);
  alter table public.home_chargers drop constraint if exists hc_area_len;
  alter table public.home_chargers add constraint hc_area_len check (char_length(area) between 2 and 120);
  alter table public.home_chargers drop constraint if exists hc_hours_len;
  alter table public.home_chargers add constraint hc_hours_len check (char_length(hours) <= 60);
  alter table public.home_chargers drop constraint if exists hc_connector_ok;
  alter table public.home_chargers add constraint hc_connector_ok check (connector in ('Type 2','15A socket','CCS2','Bharat AC-001','Bharat DC-001','CHAdeMO'));
  alter table public.home_chargers drop constraint if exists hc_price_range;
  alter table public.home_chargers add constraint hc_price_range check (price_kwh between 5 and 30);
  alter table public.home_chargers drop constraint if exists hc_status_ok;
  alter table public.home_chargers add constraint hc_status_ok check (status in ('free','busy','booked','offline'));
  alter table public.home_chargers drop constraint if exists hc_in_india;
  alter table public.home_chargers add constraint hc_in_india check (lon between 68 and 98 and lat between 6 and 37.5);
  alter table public.home_chargers drop constraint if exists hc_photos_max;
  alter table public.home_chargers add constraint hc_photos_max check (coalesce(array_length(photos, 1), 0) <= 4);

  alter table public.bookings drop constraint if exists bookings_status_ok;
  alter table public.bookings add constraint bookings_status_ok check (status in ('confirmed','cancelled','completed'));

  alter table public.install_requests drop constraint if exists ir_name_len;
  alter table public.install_requests add constraint ir_name_len check (char_length(name) between 1 and 100);
end $$;

-- ============ 3. Rate limits (anti-spam) ============
-- Generic: at most `max_rows` rows per user in `window` for the table the trigger is on.
create or replace function public.rate_limit() returns trigger language plpgsql security definer set search_path = public as $$
-- args: max rows, window, owner column (user_id / host_id)
declare n int; max_rows int := tg_argv[0]::int; win interval := tg_argv[1]::interval;
begin
  if auth.role() = 'service_role' then return new; end if;
  execute format('select count(*) from %I.%I where %I = $1 and created_at > now() - $2', tg_table_schema, tg_table_name, tg_argv[2])
    into n using (to_jsonb(new) ->> tg_argv[2])::uuid, win;
  if n >= max_rows then
    raise exception 'Too many requests. Please wait a while and try again.' using errcode = 'P0429';
  end if;
  return new;
end $$;

drop trigger if exists rl_reviews on public.reviews;
create trigger rl_reviews before insert on public.reviews for each row execute function public.rate_limit('5', '1 hour', 'user_id');
drop trigger if exists rl_reports on public.reports;
create trigger rl_reports before insert on public.reports for each row execute function public.rate_limit('5', '1 hour', 'user_id');
drop trigger if exists rl_bookings on public.bookings;
create trigger rl_bookings before insert on public.bookings for each row execute function public.rate_limit('10', '1 hour', 'user_id');
drop trigger if exists rl_chargers on public.home_chargers;
create trigger rl_chargers before insert on public.home_chargers for each row execute function public.rate_limit('5', '1 day', 'host_id');

-- install requests may come from logged-out visitors: limit per phone number instead
create or replace function public.rate_limit_install() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.install_requests where phone = new.phone and created_at > now() - interval '1 day') >= 3
     or (new.user_id is not null and (select count(*) from public.install_requests where user_id = new.user_id and created_at > now() - interval '1 hour') >= 3) then
    raise exception 'Too many requests. Please wait a while and try again.' using errcode = 'P0429';
  end if;
  return new;
end $$;
drop trigger if exists rl_install on public.install_requests;
create trigger rl_install before insert on public.install_requests for each row execute function public.rate_limit_install();

-- ============ 4. Storage: images only, 5 MB, own folder only ============
update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id in ('report-photos', 'charger-photos');

drop policy if exists "upload own folder" on storage.objects;
create policy "upload own folder" on storage.objects for insert to authenticated with check (
  bucket_id in ('report-photos','charger-photos')
  and (storage.foldername(name))[1] = auth.uid()::text
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp'));
drop policy if exists "update own files" on storage.objects;
create policy "update own files" on storage.objects for update to authenticated
  using (bucket_id in ('report-photos','charger-photos') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('report-photos','charger-photos') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "delete own files" on storage.objects;
create policy "delete own files" on storage.objects for delete to authenticated
  using (bucket_id in ('report-photos','charger-photos') and (storage.foldername(name))[1] = auth.uid()::text);
-- report photos are private: only the uploader can read them (staff use the service role)
drop policy if exists "report photos own read" on storage.objects;
create policy "report photos own read" on storage.objects for select to authenticated
  using (bucket_id = 'report-photos' and (storage.foldername(name))[1] = auth.uid()::text);
