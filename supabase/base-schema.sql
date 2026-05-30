-- Base reservation app schema.
-- Run this before reservations-rls.sql and the feature-specific SQL files.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

revoke select on public.admin_users from anon;

drop policy if exists "Admin users can read their own admin row" on public.admin_users;
create policy "Admin users can read their own admin row"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  total_seats integer not null check (total_seats > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists services_name_key
on public.services (lower(name));

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists venues_name_key
on public.venues (lower(name));

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references public.venues(id) on delete cascade,
  name text not null,
  description text,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists equipment_venue_id_idx
on public.equipment (venue_id);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  user_name text not null,
  user_email text not null,
  user_phone text,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  seats_booked integer not null check (seats_booked > 0),
  seat_labels text[] default '{}',
  status text not null default 'confirmed' check (status in ('confirmed', 'completed', 'cancelled')),
  interface_type text not null check (interface_type in ('form', 'chat')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_seat_maintenance (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  seat_label text not null,
  reason text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_seat_maintenance_label_check check (seat_label ~ '^RS([1-9]|1[0-6])$')
);

create unique index if not exists service_seat_maintenance_service_label_key
on public.service_seat_maintenance (service_id, seat_label);

create index if not exists service_seat_maintenance_active_idx
on public.service_seat_maintenance (service_id, is_active);

create or replace function public.replace_service_seat_maintenance(
  p_service_id uuid,
  p_seat_labels text[],
  p_reason text default null,
  p_created_by uuid default null
)
returns table (seat_label text)
language plpgsql
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin privileges required' using errcode = '42501';
  end if;

  update public.service_seat_maintenance
  set is_active = false
  where service_id = p_service_id
    and is_active = true;

  if coalesce(array_length(p_seat_labels, 1), 0) > 0 then
    insert into public.service_seat_maintenance (
      service_id,
      seat_label,
      reason,
      is_active,
      created_by
    )
    select
      p_service_id,
      labels.seat_label,
      nullif(trim(coalesce(p_reason, '')), ''),
      true,
      p_created_by
    from unnest(p_seat_labels) as labels(seat_label)
    on conflict (service_id, seat_label)
    do update set
      reason = excluded.reason,
      is_active = true,
      created_by = excluded.created_by,
      updated_at = now();
  end if;

  return query
  select maintenance.seat_label
  from public.service_seat_maintenance as maintenance
  where maintenance.service_id = p_service_id
    and maintenance.is_active = true
  order by (substring(maintenance.seat_label from 3))::integer;
end;
$$;

revoke all on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) from public;
grant execute on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) to authenticated;

create index if not exists bookings_service_date_status_idx
on public.bookings (service_id, booking_date, status);

create index if not exists bookings_date_idx
on public.bookings (booking_date desc);

create extension if not exists pg_trgm with schema extensions;

create index if not exists bookings_customer_search_idx
on public.bookings using gin (user_name gin_trgm_ops, user_email gin_trgm_ops, user_phone gin_trgm_ops);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_services_updated_at on public.services;
create trigger set_services_updated_at
before update on public.services
for each row execute function public.set_updated_at();

drop trigger if exists set_venues_updated_at on public.venues;
create trigger set_venues_updated_at
before update on public.venues
for each row execute function public.set_updated_at();

drop trigger if exists set_equipment_updated_at on public.equipment;
create trigger set_equipment_updated_at
before update on public.equipment
for each row execute function public.set_updated_at();

drop trigger if exists set_bookings_updated_at on public.bookings;
create trigger set_bookings_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

drop trigger if exists set_service_seat_maintenance_updated_at on public.service_seat_maintenance;
create trigger set_service_seat_maintenance_updated_at
before update on public.service_seat_maintenance
for each row execute function public.set_updated_at();

insert into public.services (name, description, total_seats)
select 'Racing Simulator', 'High-fidelity motion racing simulators', 16
where not exists (
  select 1 from public.services where lower(name) = lower('Racing Simulator')
);

insert into public.services (name, description, total_seats)
select 'Playstation 5', 'Premium PS5 gaming stations', 2
where not exists (
  select 1 from public.services where lower(name) = lower('Playstation 5')
);

insert into public.venues (name, description, address)
select
  'Project Play by CW',
  'Bandar Sunway sim racing and gaming hub',
  'Project Play By CW, 70, Jalan PJS 11/7, Bandar Sunway, 47500 Subang Jaya, Selangor'
where not exists (
  select 1 from public.venues where lower(name) = lower('Project Play by CW')
);
