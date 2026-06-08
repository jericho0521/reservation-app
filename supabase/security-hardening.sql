-- Security hardening for an already-created Supabase database.
-- Run this after base-schema.sql and the feature-specific SQL files.
-- IMPORTANT: add your admin auth user to public.admin_users before relying on admin pages.

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

alter table public.bookings
add column if not exists user_phone text;

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

create extension if not exists pg_trgm with schema extensions;

create index if not exists bookings_customer_search_idx
on public.bookings using gin (user_name gin_trgm_ops, user_email gin_trgm_ops, user_phone gin_trgm_ops);

create table if not exists public.service_seat_maintenance (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  seat_label text not null,
  reason text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_seat_maintenance_label_check check (length(trim(seat_label)) > 0)
);

alter table public.service_seat_maintenance
drop constraint if exists service_seat_maintenance_label_check;

alter table public.service_seat_maintenance
add constraint service_seat_maintenance_label_check
check (length(trim(seat_label)) > 0);

create unique index if not exists service_seat_maintenance_service_label_key
on public.service_seat_maintenance (service_id, seat_label);

create index if not exists service_seat_maintenance_active_idx
on public.service_seat_maintenance (service_id, is_active);

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

create table if not exists public.service_availability_rules (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  rule_kind text not null default 'operating_window' check (rule_kind in ('operating_window', 'blackout')),
  day_of_week integer check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_duration_minutes integer not null default 60 check (slot_duration_minutes > 0),
  interval_minutes integer not null default 60 check (interval_minutes > 0),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_availability_rules_service_active_idx
on public.service_availability_rules (service_id, is_active, day_of_week);

alter table public.resource_layouts enable row level security;
alter table public.reservable_resources enable row level security;
alter table public.reservation_items enable row level security;
alter table public.service_availability_rules enable row level security;

alter table public.service_seat_maintenance enable row level security;

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
  order by
    case
      when maintenance.seat_label ~ '^[[:alpha:]]+[0-9]+$' then regexp_replace(maintenance.seat_label, '[0-9]+$', '')
      else maintenance.seat_label
    end,
    case
      when maintenance.seat_label ~ '^[[:alpha:]]+[0-9]+$' then (regexp_match(maintenance.seat_label, '[0-9]+$'))[1]::integer
      else null
    end,
    maintenance.seat_label;
end;
$$;

revoke all on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) from public;
grant execute on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) to authenticated;

alter function public.set_updated_at()
set search_path = public;

drop trigger if exists set_service_seat_maintenance_updated_at on public.service_seat_maintenance;
create trigger set_service_seat_maintenance_updated_at
before update on public.service_seat_maintenance
for each row execute function public.set_updated_at();

drop trigger if exists set_resource_layouts_updated_at on public.resource_layouts;
create trigger set_resource_layouts_updated_at
before update on public.resource_layouts
for each row execute function public.set_updated_at();

drop trigger if exists set_reservable_resources_updated_at on public.reservable_resources;
create trigger set_reservable_resources_updated_at
before update on public.reservable_resources
for each row execute function public.set_updated_at();

drop trigger if exists set_service_availability_rules_updated_at on public.service_availability_rules;
create trigger set_service_availability_rules_updated_at
before update on public.service_availability_rules
for each row execute function public.set_updated_at();

alter function public.set_content_posts_updated_at()
set search_path = public;

alter function public.match_knowledge(extensions.vector, jsonb, double precision, integer)
set search_path = public, extensions;

drop policy if exists "Authenticated admins can manage services" on public.services;
create policy "Authenticated admins can manage services"
on public.services
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

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
    execute 'drop policy if exists "Authenticated admins can manage equipment" on public.equipment';
    execute 'create policy "Authenticated admins can manage equipment" on public.equipment for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;

drop policy if exists "Authenticated admins can manage bookings" on public.bookings;
create policy "Authenticated admins can manage bookings"
on public.bookings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated admins can manage seat maintenance" on public.service_seat_maintenance;
create policy "Authenticated admins can manage seat maintenance"
on public.service_seat_maintenance
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can read resource layouts" on public.resource_layouts;
create policy "Public can read resource layouts"
on public.resource_layouts
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated admins can manage resource layouts" on public.resource_layouts;
create policy "Authenticated admins can manage resource layouts"
on public.resource_layouts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can read reservable resources" on public.reservable_resources;
create policy "Public can read reservable resources"
on public.reservable_resources
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated admins can manage reservable resources" on public.reservable_resources;
create policy "Authenticated admins can manage reservable resources"
on public.reservable_resources
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated admins can manage reservation items" on public.reservation_items;
create policy "Authenticated admins can manage reservation items"
on public.reservation_items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can create reservation items" on public.reservation_items;
create policy "Public can create reservation items"
on public.reservation_items
for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.bookings
    where bookings.id = reservation_items.booking_id
      and bookings.service_id = reservation_items.service_id
      and bookings.status = 'confirmed'
      and bookings.interface_type in ('form', 'chat')
  )
);

drop policy if exists "Public can read service availability rules" on public.service_availability_rules;
create policy "Public can read service availability rules"
on public.service_availability_rules
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated admins can manage service availability rules" on public.service_availability_rules;
create policy "Authenticated admins can manage service availability rules"
on public.service_availability_rules
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

update public.services
set
  resource_kind = 'seat',
  selection_mode = 'assigned_resource',
  reservation_policy = jsonb_build_object(
    'kind', 'assigned_resource',
    'selection_mode', 'assigned_resource',
    'max_quantity', total_seats,
    'require_resource_labels', true,
    'allow_partial_capacity', false
  ),
  metadata = metadata || '{"migration_source":"phase_2_racing_simulator"}'::jsonb
where lower(name) = lower('Racing Simulator');

update public.services
set
  resource_kind = 'capacity_bucket',
  selection_mode = 'quantity',
  reservation_policy = jsonb_build_object(
    'kind', 'capacity',
    'selection_mode', 'quantity',
    'max_quantity', total_seats,
    'require_resource_labels', false,
    'allow_partial_capacity', true
  ),
  metadata = metadata || '{"migration_source":"phase_2_ps5_capacity"}'::jsonb
where lower(name) = lower('Playstation 5');

insert into public.resource_layouts (service_id, name, layout_kind, metadata)
select
  services.id,
  'Racing simulator island layout',
  'custom',
  '{"groups":[{"label":"Island A","resources":["RS1","RS2","RS3","RS4","RS9","RS10","RS11","RS12"]},{"label":"Island B","resources":["RS5","RS6","RS7","RS8","RS13","RS14","RS15","RS16"]}]}'::jsonb
from public.services
where lower(services.name) = lower('Racing Simulator')
  and not exists (
    select 1
    from public.resource_layouts
    where resource_layouts.service_id = services.id
      and resource_layouts.name = 'Racing simulator island layout'
  );

insert into public.reservable_resources (service_id, layout_id, label, resource_kind, capacity, sort_order, metadata)
select
  services.id,
  layouts.id,
  'RS' || series.seat_number,
  'seat',
  1,
  series.seat_number,
  jsonb_build_object('legacy_seat_label', 'RS' || series.seat_number)
from public.services
cross join generate_series(1, 16) as series(seat_number)
left join public.resource_layouts as layouts
  on layouts.service_id = services.id
  and layouts.name = 'Racing simulator island layout'
where lower(services.name) = lower('Racing Simulator')
  and not exists (
    select 1
    from public.reservable_resources
    where reservable_resources.service_id = services.id
      and lower(reservable_resources.label) = lower('RS' || series.seat_number)
  );

insert into public.reservable_resources (service_id, label, resource_kind, capacity, sort_order, metadata)
select
  services.id,
  'PS5 Capacity',
  'capacity_bucket',
  services.total_seats,
  1,
  '{"legacy_quantity_only":true}'::jsonb
from public.services
where lower(services.name) = lower('Playstation 5')
  and not exists (
    select 1
    from public.reservable_resources
    where reservable_resources.service_id = services.id
      and lower(reservable_resources.label) = lower('PS5 Capacity')
  );

insert into public.service_availability_rules (
  service_id,
  rule_kind,
  day_of_week,
  start_time,
  end_time,
  slot_duration_minutes,
  interval_minutes,
  metadata
)
select
  services.id,
  'operating_window',
  days.day_of_week,
  time '12:00',
  time '00:00',
  60,
  60,
  '{"migration_source":"legacy_noon_to_midnight_slots"}'::jsonb
from public.services
cross join generate_series(0, 6) as days(day_of_week)
where lower(services.name) in (lower('Racing Simulator'), lower('Playstation 5'))
  and not exists (
    select 1
    from public.service_availability_rules
    where service_availability_rules.service_id = services.id
      and service_availability_rules.rule_kind = 'operating_window'
      and service_availability_rules.day_of_week = days.day_of_week
      and service_availability_rules.start_time = time '12:00'
      and service_availability_rules.end_time = time '00:00'
  );

insert into public.reservation_items (
  booking_id,
  service_id,
  resource_id,
  resource_label,
  quantity,
  metadata
)
select
  bookings.id,
  bookings.service_id,
  resources.id,
  labels.seat_label,
  1,
  '{"migration_source":"legacy_booking_seat_labels"}'::jsonb
from public.bookings
cross join lateral unnest(coalesce(bookings.seat_labels, '{}'::text[])) as labels(seat_label)
left join public.reservable_resources as resources
  on resources.service_id = bookings.service_id
  and lower(resources.label) = lower(labels.seat_label)
where not exists (
  select 1
  from public.reservation_items
  where reservation_items.booking_id = bookings.id
    and reservation_items.resource_label = labels.seat_label
);

insert into public.reservation_items (
  booking_id,
  service_id,
  resource_id,
  quantity,
  metadata
)
select
  bookings.id,
  bookings.service_id,
  resources.id,
  bookings.seats_booked,
  '{"migration_source":"legacy_booking_quantity"}'::jsonb
from public.bookings
left join lateral (
  select id
  from public.reservable_resources
  where reservable_resources.service_id = bookings.service_id
    and reservable_resources.resource_kind = 'capacity_bucket'
  order by sort_order, label
  limit 1
) as resources on true
where coalesce(array_length(bookings.seat_labels, 1), 0) = 0
  and not exists (
    select 1
    from public.reservation_items
    where reservation_items.booking_id = bookings.id
  );

drop policy if exists "Authenticated users can manage content" on public.content_posts;
create policy "Authenticated users can manage content"
on public.content_posts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated admins can manage sales report documents" on public.sales_report_documents;
create policy "Authenticated admins can manage sales report documents"
on public.sales_report_documents
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated admins can manage daily sales reports" on public.daily_sales_reports;
create policy "Authenticated admins can manage daily sales reports"
on public.daily_sales_reports
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Auth users can manage checkpoints" on public.checkpoints;
create policy "Auth users can manage checkpoints"
on public.checkpoints
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Auth users can manage checkpoint writes" on public.checkpoint_writes;
create policy "Auth users can manage checkpoint writes"
on public.checkpoint_writes
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Auth users can manage checkpoint blobs" on public.checkpoint_blobs;
create policy "Auth users can manage checkpoint blobs"
on public.checkpoint_blobs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Blog assets are publicly readable" on storage.objects;

drop policy if exists "Authenticated users can manage blog assets" on storage.objects;
create policy "Authenticated users can manage blog assets"
on storage.objects
for all
to authenticated
using (bucket_id = 'blog-assets' and public.is_admin())
with check (bucket_id = 'blog-assets' and public.is_admin());

drop policy if exists "Authenticated admins can manage sales report files" on storage.objects;
create policy "Authenticated admins can manage sales report files"
on storage.objects
for all
to authenticated
using (bucket_id = 'sales-report-documents' and public.is_admin())
with check (bucket_id = 'sales-report-documents' and public.is_admin());
