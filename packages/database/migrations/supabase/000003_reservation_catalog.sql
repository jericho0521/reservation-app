-- Reservation platform database bundle artifact.
-- Source: supabase/base-schema.sql
-- Section: services, venues, indexes, and updated_at trigger behavior.
-- Status: curated runnable package-owned migration asset; live database proof
-- is still pending.

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  total_seats integer not null check (total_seats > 0),
  resource_kind text not null default 'capacity_bucket' check (resource_kind in ('seat', 'station', 'room', 'court', 'screening', 'capacity_bucket', 'custom')),
  selection_mode text not null default 'quantity' check (selection_mode in ('quantity', 'assigned_resource', 'hybrid')),
  reservation_policy jsonb not null default '{"kind":"capacity","selection_mode":"quantity","require_resource_labels":false,"allow_partial_capacity":true}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.services
add column if not exists resource_kind text not null default 'capacity_bucket';

alter table public.services
add column if not exists selection_mode text not null default 'quantity';

alter table public.services
add column if not exists reservation_policy jsonb not null default '{"kind":"capacity","selection_mode":"quantity","require_resource_labels":false,"allow_partial_capacity":true}'::jsonb;

alter table public.services
add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'services_resource_kind_check'
      and conrelid = 'public.services'::regclass
  ) then
    alter table public.services
    add constraint services_resource_kind_check
    check (resource_kind in ('seat', 'station', 'room', 'court', 'screening', 'capacity_bucket', 'custom'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'services_selection_mode_check'
      and conrelid = 'public.services'::regclass
  ) then
    alter table public.services
    add constraint services_selection_mode_check
    check (selection_mode in ('quantity', 'assigned_resource', 'hybrid'));
  end if;
end $$;

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
