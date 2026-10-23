-- ChargeEVSetu: Supabase schema + Row Level Security.
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent where practical).

-- ============ reviews ============
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  station_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  author text not null check (char_length(author) <= 80),
  rating int not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 1000),
  created_at timestamptz not null default now(),
  unique (station_id, user_id)
);
alter table public.reviews enable row level security;
drop policy if exists "reviews readable" on public.reviews;
create policy "reviews readable" on public.reviews for select using (true);
drop policy if exists "reviews own insert" on public.reviews;
create policy "reviews own insert" on public.reviews for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "reviews own update" on public.reviews;
create policy "reviews own update" on public.reviews for update to authenticated using (user_id = auth.uid());
drop policy if exists "reviews own delete" on public.reviews;
create policy "reviews own delete" on public.reviews for delete to authenticated using (user_id = auth.uid());
create index if not exists reviews_station on public.reviews (station_id, created_at desc);

-- ============ problem reports (write-only for users; staff read via service role) ============
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  station_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('broken','wrong_location','blocked','other')),
  note text not null default '' check (char_length(note) <= 1000),
  photo_path text,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "reports own insert" on public.reports;
create policy "reports own insert" on public.reports for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "reports own read" on public.reports;
create policy "reports own read" on public.reports for select to authenticated using (user_id = auth.uid());

-- ============ Plugsy: home chargers ============
create table if not exists public.home_chargers (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  host_name text not null check (char_length(host_name) <= 80),
  title text not null check (char_length(title) <= 120),
  area text not null check (char_length(area) <= 120),
  lon double precision not null, -- approximate (~500 m), the exact address lives in home_charger_private
  lat double precision not null,
  type text not null check (type in ('AC','DC')),
  power_kw numeric not null check (power_kw > 0 and power_kw <= 150),
  connector text not null,
  price_kwh numeric not null check (price_kwh between 5 and 30),
  hours text not null default '',
  status text not null default 'offline' check (status in ('free','busy','booked','offline')),
  verified boolean not null default false, -- set by staff only (see trigger)
  photos text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.home_chargers enable row level security;
drop policy if exists "chargers readable" on public.home_chargers;
create policy "chargers readable" on public.home_chargers for select using (true);
drop policy if exists "chargers host insert" on public.home_chargers;
create policy "chargers host insert" on public.home_chargers for insert to authenticated with check (host_id = auth.uid() and verified = false);
drop policy if exists "chargers host update" on public.home_chargers;
create policy "chargers host update" on public.home_chargers for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());
drop policy if exists "chargers host delete" on public.home_chargers;
create policy "chargers host delete" on public.home_chargers for delete to authenticated using (host_id = auth.uid());

-- hosts cannot verify themselves
create or replace function public.keep_verified() returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' then new.verified := old.verified; end if;
  return new;
end $$;
drop trigger if exists keep_verified on public.home_chargers;
create trigger keep_verified before update on public.home_chargers for each row execute function public.keep_verified();

create table if not exists public.home_charger_private (
  charger_id uuid primary key references public.home_chargers(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  address text not null check (char_length(address) <= 300)
);
alter table public.home_charger_private enable row level security;
drop policy if exists "private host all" on public.home_charger_private;
create policy "private host all" on public.home_charger_private for all to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());
-- bookers see the address only through bookings_view (security definer join below)

-- ============ bookings ============
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  charger_id uuid not null references public.home_chargers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  start_at timestamptz not null,
  hours numeric not null check (hours > 0 and hours <= 12),
  amount numeric not null check (amount >= 0),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','completed')),
  payment text not null default 'demo' check (payment in ('demo')),
  created_at timestamptz not null default now()
);
alter table public.bookings enable row level security;
drop policy if exists "bookings party read" on public.bookings;
create policy "bookings party read" on public.bookings for select to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.home_chargers c where c.id = charger_id and c.host_id = auth.uid()));
drop policy if exists "bookings own cancel" on public.bookings;
create policy "bookings own cancel" on public.bookings for update to authenticated using (user_id = auth.uid()) with check (status = 'cancelled');
-- inserts only through book_charger(), which prices the slot server-side

create or replace function public.book_charger(p_charger uuid, p_start timestamptz, p_hours numeric)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare c public.home_chargers; b public.bookings;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into c from public.home_chargers where id = p_charger for update;
  if not found or c.status in ('offline') then raise exception 'charger unavailable'; end if;
  if c.host_id = auth.uid() then raise exception 'cannot book your own charger'; end if;
  if p_hours <= 0 or p_hours > 12 or p_start < now() - interval '10 minutes' then raise exception 'invalid slot'; end if;
  if exists (select 1 from public.bookings x where x.charger_id = p_charger and x.status = 'confirmed'
             and tstzrange(x.start_at, x.start_at + make_interval(secs => x.hours * 3600)) && tstzrange(p_start, p_start + make_interval(secs => p_hours * 3600)))
    then raise exception 'slot already booked'; end if;
  insert into public.bookings (charger_id, user_id, start_at, hours, amount)
    values (p_charger, auth.uid(), p_start, p_hours, round(c.power_kw * p_hours * c.price_kwh * 0.9 + 10))
    returning * into b;
  if c.status = 'free' then update public.home_chargers set status = 'booked' where id = p_charger; end if;
  return b;
end $$;
grant execute on function public.book_charger(uuid, timestamptz, numeric) to authenticated;

-- exact address: only the booker of a confirmed booking (or the host)
create or replace function public.booking_address(p_booking uuid) returns text
language sql security definer set search_path = public stable as $$
  select p.address from public.bookings b
  join public.home_chargers c on c.id = b.charger_id
  join public.home_charger_private p on p.charger_id = c.id
  where b.id = p_booking and b.status = 'confirmed' and (b.user_id = auth.uid() or c.host_id = auth.uid())
$$;
create or replace view public.bookings_view with (security_invoker = on) as
  select b.*, c.host_id, public.booking_address(b.id) as address
  from public.bookings b join public.home_chargers c on c.id = b.charger_id;

-- ============ install requests ============
create table if not exists public.install_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) <= 80),
  phone text not null check (phone ~ '^[0-9 +-]{8,15}$'),
  city text not null check (char_length(city) <= 80),
  kind text not null check (kind in ('home_ac','high_power')),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);
alter table public.install_requests enable row level security;
drop policy if exists "install insert" on public.install_requests;
create policy "install insert" on public.install_requests for insert with check (user_id is null or user_id = auth.uid());

-- ============ realtime ============
do $$ begin
  alter publication supabase_realtime add table public.home_chargers;
exception when duplicate_object then null; end $$;

-- ============ storage ============
insert into storage.buckets (id, name, public) values ('report-photos', 'report-photos', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('charger-photos', 'charger-photos', true) on conflict (id) do nothing;
drop policy if exists "upload own folder" on storage.objects;
create policy "upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id in ('report-photos','charger-photos') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "charger photos public" on storage.objects;
create policy "charger photos public" on storage.objects for select using (bucket_id = 'charger-photos');
