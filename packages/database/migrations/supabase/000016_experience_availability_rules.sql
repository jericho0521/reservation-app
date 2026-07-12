-- Venue-scoped Experience Studio operating hours, booking limits, closures,
-- atomic replacement, and availability-snapshot integration.

create table if not exists public.platform_availability_settings (
  tenant_id text not null,
  venue_id uuid not null,
  timezone text not null check (length(trim(timezone)) > 0),
  booking_horizon_days integer not null default 60 check (booking_horizon_days between 1 and 365),
  slot_interval_minutes integer not null default 60 check (slot_interval_minutes between 5 and 720),
  minimum_notice_minutes integer not null default 0 check (minimum_notice_minutes between 0 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, venue_id),
  foreign key (tenant_id, venue_id) references public.venues(tenant_id, id) on delete cascade
);

create table if not exists public.platform_operating_intervals (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  venue_id uuid not null,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, venue_id)
    references public.platform_availability_settings(tenant_id, venue_id) on delete cascade,
  check (start_time < end_time),
  unique (tenant_id, venue_id, day_of_week, start_time, end_time)
);

create table if not exists public.platform_date_closures (
  tenant_id text not null,
  venue_id uuid not null,
  closure_date date not null,
  reason text check (reason is null or length(reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, venue_id, closure_date),
  foreign key (tenant_id, venue_id)
    references public.platform_availability_settings(tenant_id, venue_id) on delete cascade
);

create index if not exists platform_operating_intervals_venue_day_idx
on public.platform_operating_intervals (tenant_id, venue_id, day_of_week, start_time);

create index if not exists platform_date_closures_venue_date_idx
on public.platform_date_closures (tenant_id, venue_id, closure_date);

create or replace function public.prevent_platform_operating_interval_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.platform_operating_intervals existing
    where existing.tenant_id = new.tenant_id
      and existing.venue_id = new.venue_id
      and existing.day_of_week = new.day_of_week
      and existing.id <> new.id
      and new.start_time < existing.end_time
      and new.end_time > existing.start_time
  ) then
    raise exception 'operating intervals on the same day cannot overlap';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_platform_operating_interval_overlap on public.platform_operating_intervals;
create trigger prevent_platform_operating_interval_overlap
before insert or update on public.platform_operating_intervals
for each row execute function public.prevent_platform_operating_interval_overlap();

drop trigger if exists set_platform_availability_settings_updated_at on public.platform_availability_settings;
create trigger set_platform_availability_settings_updated_at
before update on public.platform_availability_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_platform_operating_intervals_updated_at on public.platform_operating_intervals;
create trigger set_platform_operating_intervals_updated_at
before update on public.platform_operating_intervals
for each row execute function public.set_updated_at();

drop trigger if exists set_platform_date_closures_updated_at on public.platform_date_closures;
create trigger set_platform_date_closures_updated_at
before update on public.platform_date_closures
for each row execute function public.set_updated_at();

create or replace function public.read_experience_operating_hours(
  p_tenant_id text,
  p_venue_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tenant_id', settings.tenant_id,
    'venue_id', settings.venue_id,
    'timezone', settings.timezone,
    'booking_horizon_days', settings.booking_horizon_days,
    'slot_interval_minutes', settings.slot_interval_minutes,
    'minimum_notice_minutes', settings.minimum_notice_minutes,
    'intervals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day_of_week', intervals.day_of_week,
        'start_time', to_char(intervals.start_time, 'HH24:MI'),
        'end_time', to_char(intervals.end_time, 'HH24:MI')
      ) order by intervals.day_of_week, intervals.start_time, intervals.end_time)
      from public.platform_operating_intervals intervals
      where intervals.tenant_id = settings.tenant_id
        and intervals.venue_id = settings.venue_id
    ), '[]'::jsonb),
    'closures', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'date', closures.closure_date,
        'reason', closures.reason
      )) order by closures.closure_date)
      from public.platform_date_closures closures
      where closures.tenant_id = settings.tenant_id
        and closures.venue_id = settings.venue_id
    ), '[]'::jsonb),
    'updated_at', settings.updated_at
  )
  from public.platform_availability_settings settings
  where settings.tenant_id = p_tenant_id
    and settings.venue_id = p_venue_id;
$$;

create or replace function public.replace_experience_operating_hours(
  p_tenant_id text,
  p_venue_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_timezone text := trim(p_input->>'timezone');
begin
  if not exists (
    select 1 from public.venues
    where tenant_id = p_tenant_id and id = p_venue_id
  ) then
    raise exception 'venue does not belong to tenant';
  end if;

  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    raise exception 'invalid IANA timezone';
  end if;

  insert into public.platform_availability_settings (
    tenant_id, venue_id, timezone, booking_horizon_days,
    slot_interval_minutes, minimum_notice_minutes
  ) values (
    p_tenant_id,
    p_venue_id,
    v_timezone,
    (p_input->>'booking_horizon_days')::integer,
    (p_input->>'slot_interval_minutes')::integer,
    (p_input->>'minimum_notice_minutes')::integer
  )
  on conflict (tenant_id, venue_id) do update set
    timezone = excluded.timezone,
    booking_horizon_days = excluded.booking_horizon_days,
    slot_interval_minutes = excluded.slot_interval_minutes,
    minimum_notice_minutes = excluded.minimum_notice_minutes;

  delete from public.platform_operating_intervals
  where tenant_id = p_tenant_id and venue_id = p_venue_id;

  insert into public.platform_operating_intervals (
    tenant_id, venue_id, day_of_week, start_time, end_time
  )
  select
    p_tenant_id,
    p_venue_id,
    interval.day_of_week,
    interval.start_time::time,
    interval.end_time::time
  from jsonb_to_recordset(coalesce(p_input->'intervals', '[]'::jsonb))
    as interval(day_of_week integer, start_time text, end_time text);

  delete from public.platform_date_closures
  where tenant_id = p_tenant_id and venue_id = p_venue_id;

  insert into public.platform_date_closures (
    tenant_id, venue_id, closure_date, reason
  )
  select
    p_tenant_id,
    p_venue_id,
    closure.date::date,
    nullif(trim(closure.reason), '')
  from jsonb_to_recordset(coalesce(p_input->'closures', '[]'::jsonb))
    as closure(date text, reason text);

  return public.read_experience_operating_hours(p_tenant_id, p_venue_id);
end;
$$;

-- Refresh the snapshot RPC so every channel receives the same venue schedule.
create or replace function public.read_reservation_availability_snapshot(
  p_service_id uuid,
  p_date date
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'service', jsonb_build_object(
      'id', services.id,
      'name', services.name,
      'description', services.description,
      'total_seats', services.total_seats,
      'created_at', services.created_at,
      'resource_kind', services.resource_kind,
      'selection_mode', services.selection_mode,
      'reservation_policy', services.reservation_policy,
      'metadata', services.metadata
    ),
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(bookings) order by bookings.start_time, bookings.id)
      from public.bookings
      where bookings.service_id = services.id
        and bookings.booking_date = p_date
        and bookings.status = 'confirmed'
    ), '[]'::jsonb),
    'maintenance', coalesce((
      select jsonb_agg(jsonb_build_object('seat_label', maintenance.seat_label) order by maintenance.seat_label)
      from public.service_seat_maintenance maintenance
      where maintenance.service_id = services.id and maintenance.is_active = true
    ), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', resources.id,
        'service_id', resources.service_id,
        'label', resources.label,
        'kind', resources.resource_kind,
        'resource_kind', resources.resource_kind,
        'status', resources.status,
        'is_active', resources.status <> 'inactive',
        'capacity', resources.capacity,
        'metadata', resources.metadata
      ) order by resources.sort_order, resources.label, resources.id)
      from public.reservable_resources resources
      where resources.service_id = services.id
    ), '[]'::jsonb),
    'layout', (
      select jsonb_build_object('layout_kind', layouts.layout_kind, 'metadata', layouts.metadata)
      from public.resource_layouts layouts
      where layouts.service_id = services.id and layouts.is_active = true
    ),
    'operating_hours', (
      select public.read_experience_operating_hours(venues.tenant_id, venues.id)
      from public.venues
      where venues.id = services.venue_id
    )
  )
  from public.services
  where services.id = p_service_id;
$$;

alter table public.platform_availability_settings enable row level security;
alter table public.platform_operating_intervals enable row level security;
alter table public.platform_date_closures enable row level security;

revoke all on table public.platform_availability_settings from public, anon, authenticated;
revoke all on table public.platform_operating_intervals from public, anon, authenticated;
revoke all on table public.platform_date_closures from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_availability_settings to service_role;
grant select, insert, update, delete on table public.platform_operating_intervals to service_role;
grant select, insert, update, delete on table public.platform_date_closures to service_role;

revoke all on function public.read_experience_operating_hours(text, uuid) from public, anon, authenticated;
revoke all on function public.replace_experience_operating_hours(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.read_experience_operating_hours(text, uuid) to service_role;
grant execute on function public.replace_experience_operating_hours(text, uuid, jsonb) to service_role;
revoke all on function public.read_reservation_availability_snapshot(uuid, date) from public;
grant execute on function public.read_reservation_availability_snapshot(uuid, date) to service_role;
