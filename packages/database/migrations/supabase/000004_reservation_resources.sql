-- Reservation platform database bundle artifact.
-- Source: supabase/base-schema.sql
-- Section: resource_layouts, reservable_resources, indexes, and triggers.
-- Status: curated runnable package-owned migration asset; live database proof
-- is still pending.

create table if not exists public.resource_layouts (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  name text,
  layout_kind text not null default 'none' check (layout_kind in ('none', 'grid', 'custom')),
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resource_layouts_service_active_idx
on public.resource_layouts (service_id, is_active);

create table if not exists public.reservable_resources (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  layout_id uuid references public.resource_layouts(id) on delete set null,
  label text not null check (length(trim(label)) > 0),
  resource_kind text not null default 'seat' check (resource_kind in ('seat', 'station', 'room', 'court', 'screening', 'capacity_bucket', 'custom')),
  capacity integer not null default 1 check (capacity > 0),
  sort_order integer not null default 0,
  status text not null default 'available' check (status in ('available', 'maintenance', 'inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists reservable_resources_service_label_key
on public.reservable_resources (service_id, lower(label));

create index if not exists reservable_resources_service_status_idx
on public.reservable_resources (service_id, status, sort_order);

drop trigger if exists set_resource_layouts_updated_at on public.resource_layouts;
create trigger set_resource_layouts_updated_at
before update on public.resource_layouts
for each row execute function public.set_updated_at();

drop trigger if exists set_reservable_resources_updated_at on public.reservable_resources;
create trigger set_reservable_resources_updated_at
before update on public.reservable_resources
for each row execute function public.set_updated_at();
