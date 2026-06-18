-- Reservation platform database bundle artifact.
-- Source: supabase/base-schema.sql
-- Section: bookings, reservation_items, constraints, indexes, and triggers.
-- Status: curated runnable package-owned migration asset; live database proof
-- is still pending.

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

create index if not exists bookings_service_date_status_idx
on public.bookings (service_id, booking_date, status);

create index if not exists bookings_date_idx
on public.bookings (booking_date desc);

create index if not exists bookings_customer_search_idx
on public.bookings using gin (
  user_name extensions.gin_trgm_ops,
  user_email extensions.gin_trgm_ops,
  user_phone extensions.gin_trgm_ops
);

create table if not exists public.reservation_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  resource_id uuid references public.reservable_resources(id) on delete set null,
  resource_label text,
  quantity integer not null check (quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint reservation_items_resource_label_check check (resource_label is null or length(trim(resource_label)) > 0)
);

create index if not exists reservation_items_booking_id_idx
on public.reservation_items (booking_id);

create index if not exists reservation_items_service_resource_idx
on public.reservation_items (service_id, resource_id);

drop trigger if exists set_bookings_updated_at on public.bookings;
create trigger set_bookings_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();
