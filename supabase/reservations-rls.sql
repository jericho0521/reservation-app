-- Reservation app RLS hardening template.
-- Review in the Supabase SQL editor before running.
--
-- Security intent:
-- - Services, venues, and equipment are public catalogue data.
-- - Public customers can create bookings through the app.
-- - Only authenticated admins can list, inspect, update, or cancel bookings.
--
-- Important compatibility note:
-- This template intentionally does not grant anon SELECT on public.bookings
-- because that would expose customer names and emails to anyone with the anon key.
-- Apply it only after SUPABASE_SERVICE_ROLE_KEY is configured for the app so
-- server API routes can perform private availability and booking checks.

alter table public.services enable row level security;
alter table public.venues enable row level security;
alter table public.bookings enable row level security;

do $$
begin
  if to_regclass('public.equipment') is not null then
    execute 'alter table public.equipment enable row level security';
  end if;
end $$;

drop policy if exists "Public can read services" on public.services;
create policy "Public can read services"
on public.services
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated admins can manage services" on public.services;
create policy "Authenticated admins can manage services"
on public.services
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can read venues" on public.venues;
create policy "Public can read venues"
on public.venues
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated admins can manage venues" on public.venues;
create policy "Authenticated admins can manage venues"
on public.venues
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

do $$
begin
  if to_regclass('public.equipment') is not null then
    execute 'drop policy if exists "Public can read equipment" on public.equipment';
    execute 'create policy "Public can read equipment" on public.equipment for select to anon, authenticated using (true)';
    execute 'drop policy if exists "Authenticated admins can manage equipment" on public.equipment';
    execute 'create policy "Authenticated admins can manage equipment" on public.equipment for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;

drop policy if exists "Public can create bookings" on public.bookings;
create policy "Public can create bookings"
on public.bookings
for insert
to anon, authenticated
with check (
  status = 'confirmed'
  and interface_type in ('form', 'chat')
);

drop policy if exists "Authenticated admins can manage bookings" on public.bookings;
create policy "Authenticated admins can manage bookings"
on public.bookings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
