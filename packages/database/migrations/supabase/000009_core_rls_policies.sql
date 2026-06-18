-- Reservation platform database bundle artifact.
-- Source: supabase/reservations-rls.sql
-- Section: reservation platform RLS enablement and policies.
-- Status: concrete package-owned migration asset. This file is intended to be
-- runnable as part of the backend database package, but it is not promoted as
-- live-proven tenant isolation until disposable database migration/RLS tests
-- execute it against seeded tenant data.
--
-- Security intent:
-- - Services, venues, and equipment are public catalogue data.
-- - Public customers can create bookings through the app.
-- - Only authenticated admins can list, inspect, update, or cancel bookings.
--
-- Important compatibility note:
-- This migration intentionally does not grant anon SELECT on public.bookings
-- because that would expose customer names and emails to anyone with the anon
-- key. Apply it only after service-role backend access is configured for
-- private availability and booking checks.

alter table public.services enable row level security;
alter table public.venues enable row level security;
alter table public.bookings enable row level security;

do $$
begin
  if to_regclass('public.resource_layouts') is not null then
    execute 'alter table public.resource_layouts enable row level security';
  end if;

  if to_regclass('public.reservable_resources') is not null then
    execute 'alter table public.reservable_resources enable row level security';
  end if;

  if to_regclass('public.reservation_items') is not null then
    execute 'alter table public.reservation_items enable row level security';
  end if;

  if to_regclass('public.service_availability_rules') is not null then
    execute 'alter table public.service_availability_rules enable row level security';
  end if;

  if to_regclass('public.service_seat_maintenance') is not null then
    execute 'alter table public.service_seat_maintenance enable row level security';
  end if;
end $$;

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

do $$
begin
  if to_regclass('public.service_seat_maintenance') is not null then
    execute 'drop policy if exists "Authenticated admins can manage seat maintenance" on public.service_seat_maintenance';
    execute 'create policy "Authenticated admins can manage seat maintenance" on public.service_seat_maintenance for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;

  if to_regclass('public.resource_layouts') is not null then
    execute 'drop policy if exists "Public can read resource layouts" on public.resource_layouts';
    execute 'create policy "Public can read resource layouts" on public.resource_layouts for select to anon, authenticated using (true)';
    execute 'drop policy if exists "Authenticated admins can manage resource layouts" on public.resource_layouts';
    execute 'create policy "Authenticated admins can manage resource layouts" on public.resource_layouts for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;

  if to_regclass('public.reservable_resources') is not null then
    execute 'drop policy if exists "Public can read reservable resources" on public.reservable_resources';
    execute 'create policy "Public can read reservable resources" on public.reservable_resources for select to anon, authenticated using (true)';
    execute 'drop policy if exists "Authenticated admins can manage reservable resources" on public.reservable_resources';
    execute 'create policy "Authenticated admins can manage reservable resources" on public.reservable_resources for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;

  if to_regclass('public.reservation_items') is not null then
    execute 'drop policy if exists "Authenticated admins can manage reservation items" on public.reservation_items';
    execute 'create policy "Authenticated admins can manage reservation items" on public.reservation_items for all to authenticated using (public.is_admin()) with check (public.is_admin())';
    execute 'drop policy if exists "Public can create reservation items" on public.reservation_items';
    execute 'create policy "Public can create reservation items" on public.reservation_items for insert to anon, authenticated with check (exists (select 1 from public.bookings where bookings.id = reservation_items.booking_id and bookings.service_id = reservation_items.service_id and bookings.status = ''confirmed'' and bookings.interface_type in (''form'', ''chat'')))';
  end if;

  if to_regclass('public.service_availability_rules') is not null then
    execute 'drop policy if exists "Public can read service availability rules" on public.service_availability_rules';
    execute 'create policy "Public can read service availability rules" on public.service_availability_rules for select to anon, authenticated using (true)';
    execute 'drop policy if exists "Authenticated admins can manage service availability rules" on public.service_availability_rules';
    execute 'create policy "Authenticated admins can manage service availability rules" on public.service_availability_rules for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;
