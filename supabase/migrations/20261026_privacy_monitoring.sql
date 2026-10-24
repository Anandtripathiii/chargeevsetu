-- ChargeEVSetu security round 2: privacy by design, account deletion, moderation, admin monitoring.
-- Run in Supabase -> SQL Editor AFTER 20261025_security.sql. Safe to re-run.

-- ============ 1. Public listings: only an approximate location (~500 m), enforced in the database ============
create or replace function public.round_location() returns trigger language plpgsql as $$
begin
  new.lon := round(new.lon::numeric * 200) / 200;
  new.lat := round(new.lat::numeric * 200) / 200;
  return new;
end $$;
drop trigger if exists round_location on public.home_chargers;
create trigger round_location before insert or update of lon, lat on public.home_chargers for each row execute function public.round_location();
update public.home_chargers set lon = lon, lat = lat; -- re-round existing rows

-- Safe public view: only the columns a listing needs (no host id, no address, no contact).
create or replace view public.home_chargers_public with (security_invoker = on) as
  select id, host_name, title, area, lon, lat, type, power_kw, connector, price_kwh, hours, status, verified, photos, created_at
  from public.home_chargers;
grant select on public.home_chargers_public to anon, authenticated;

-- ============ 2. Private host data: exact address + optional contact ============
alter table public.home_charger_private add column if not exists contact text;
do $$ begin
  alter table public.home_charger_private drop constraint if exists hcp_contact_len;
  alter table public.home_charger_private add constraint hcp_contact_len check (contact is null or contact ~ '^[0-9 +-]{8,15}$');
  alter table public.home_charger_private drop constraint if exists hcp_address_len;
  alter table public.home_charger_private add constraint hcp_address_len check (char_length(address) between 5 and 300);
end $$;
-- the host manages it; a driver can READ it only while they hold a CONFIRMED booking for that charger
drop policy if exists "private booker read" on public.home_charger_private;
create policy "private booker read" on public.home_charger_private for select to authenticated using (
  exists (select 1 from public.bookings b where b.charger_id = home_charger_private.charger_id and b.user_id = auth.uid() and b.status = 'confirmed'));

-- ============ 3. Moderation: hidden reviews + user flags ============
alter table public.reviews add column if not exists hidden boolean not null default false;
drop policy if exists "reviews readable" on public.reviews;
create policy "reviews readable" on public.reviews for select using (not hidden or user_id = auth.uid());
drop policy if exists "reviews own insert" on public.reviews;
create policy "reviews own insert" on public.reviews for insert to authenticated with check (user_id = auth.uid() and hidden = false);
create or replace function public.keep_hidden() returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' then new.hidden := old.hidden; new.user_id := old.user_id; new.station_id := old.station_id; new.created_at := old.created_at; end if;
  return new;
end $$;
drop trigger if exists keep_hidden on public.reviews;
create trigger keep_hidden before update on public.reviews for each row execute function public.keep_hidden();

create table if not exists public.review_flags (
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);
alter table public.review_flags enable row level security;
alter table public.review_flags force row level security;
drop policy if exists "flags own insert" on public.review_flags;
create policy "flags own insert" on public.review_flags for insert to authenticated with check (user_id = auth.uid());
drop trigger if exists rl_flags on public.review_flags;
create trigger rl_flags before insert on public.review_flags for each row execute function public.rate_limit('10', '1 hour', 'user_id');

-- ============ 4. Admin event log (failed admin logins etc.): service role only, no policies ============
create table if not exists public.admin_events (
  id bigint generated always as identity primary key,
  kind text not null check (char_length(kind) <= 40),
  ip text check (char_length(ip) <= 64),
  detail text check (char_length(detail) <= 200),
  created_at timestamptz not null default now()
);
alter table public.admin_events enable row level security;
alter table public.admin_events force row level security;
revoke all on public.admin_events from anon, authenticated;

-- ============ 5. Delete my account and data ============
-- Storage files are removed by the app first (storage API); this removes every row and the login itself.
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'login required'; end if;
  delete from public.review_flags where user_id = me;
  delete from public.reviews where user_id = me;
  delete from public.reports where user_id = me;
  delete from public.bookings where user_id = me;
  delete from public.home_chargers where host_id = me; -- cascades to private data and bookings on my chargers
  delete from public.install_requests where user_id = me;
  delete from auth.users where id = me;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ============ 6. No public access to anything personal ============
revoke all on public.install_requests from anon;
grant insert on public.install_requests to anon; -- logged-out visitors may request an installation, never read
revoke select on public.reports, public.home_charger_private, public.bookings from anon;
revoke select on public.bookings_view from anon;
-- roles live in auth.users.raw_app_meta_data, which only the service role can change; the app never trusts
-- user_metadata for permissions. There is no admin flag in any user-writable table.
