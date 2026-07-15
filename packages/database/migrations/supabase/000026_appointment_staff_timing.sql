-- Appointment service timing, practitioner profiles, assignments, and atomic
-- staff/resource persistence. Direct access remains service-role only.

alter table public.services
  add column if not exists duration_minutes integer not null default 60 check (duration_minutes > 0),
  add column if not exists buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  add column if not exists buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  add column if not exists display_price numeric(12,2) check (display_price is null or display_price >= 0),
  add column if not exists currency text check (currency is null or currency ~ '^[A-Z]{3}$');

create table public.platform_staff_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id),
  user_id uuid references public.platform_users(id) on delete set null,
  display_name text not null check (length(trim(display_name)) > 0),
  reservable_resource_id uuid not null unique references public.reservable_resources(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_staff_locations (
  staff_id uuid not null references public.platform_staff_profiles(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  primary key (staff_id, venue_id)
);

create table public.platform_staff_services (
  staff_id uuid not null references public.platform_staff_profiles(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (staff_id, service_id)
);

create index platform_staff_profiles_tenant_status_idx
on public.platform_staff_profiles (tenant_id, status, display_name);

create index platform_staff_locations_venue_idx
on public.platform_staff_locations (venue_id, staff_id);

create index platform_staff_services_service_idx
on public.platform_staff_services (service_id, staff_id);

alter table public.bookings
  add column if not exists staff_id uuid references public.platform_staff_profiles(id) on delete restrict,
  add column if not exists channel text not null default 'web_booking'
    check (channel in ('web_booking', 'web_chat', 'whatsapp', 'staff', 'simulation'));

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show'));

create index bookings_staff_date_status_idx
on public.bookings (staff_id, booking_date, status)
where staff_id is not null;

create or replace function public.platform_validate_staff_profile_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_resource_tenant_id text;
  v_resource_capacity integer;
  v_resource_kind text;
  v_resource_staff_id text;
begin
  if new.user_id is not null and not exists (
    select 1
    from public.platform_users as platform_user
    where platform_user.id = new.user_id
      and platform_user.tenant_id = new.tenant_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Staff user must belong to the staff tenant.';
  end if;

  select
    venue.tenant_id,
    resource.capacity,
    resource.resource_kind,
    resource.metadata ->> 'platform_staff_id'
  into
    v_resource_tenant_id,
    v_resource_capacity,
    v_resource_kind,
    v_resource_staff_id
  from public.reservable_resources as resource
  join public.services as service on service.id = resource.service_id
  join public.venues as venue on venue.id = service.venue_id
  where resource.id = new.reservable_resource_id;

  if not found
    or v_resource_tenant_id <> new.tenant_id
    or v_resource_capacity <> 1
    or v_resource_kind <> 'custom'
    or v_resource_staff_id <> new.id::text
  then
    raise exception using
      errcode = '23514',
      message = 'Staff resource must be a tenant-owned capacity-1 custom resource linked to the profile.';
  end if;

  return new;
end;
$$;

create or replace function public.platform_validate_staff_location_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.platform_staff_profiles as staff
    join public.venues as venue on venue.id = new.venue_id
    where staff.id = new.staff_id
      and staff.tenant_id = venue.tenant_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Staff location must belong to the staff tenant.';
  end if;
  return new;
end;
$$;

create or replace function public.platform_validate_staff_service_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.platform_staff_profiles as staff
    join public.services as service on service.id = new.service_id
    join public.venues as venue on venue.id = service.venue_id
    where staff.id = new.staff_id
      and staff.tenant_id = venue.tenant_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Staff service must belong to the staff tenant.';
  end if;
  return new;
end;
$$;

create trigger platform_validate_staff_profile_scope
before insert or update of tenant_id, user_id, reservable_resource_id
on public.platform_staff_profiles
for each row execute function public.platform_validate_staff_profile_scope();

create trigger platform_validate_staff_location_scope
before insert or update on public.platform_staff_locations
for each row execute function public.platform_validate_staff_location_scope();

create trigger platform_validate_staff_service_scope
before insert or update on public.platform_staff_services
for each row execute function public.platform_validate_staff_service_scope();

create trigger set_platform_staff_profiles_updated_at
before update on public.platform_staff_profiles
for each row execute function public.set_updated_at();

create or replace function public.platform_list_staff_profiles(
  p_tenant_id text,
  p_venue_id uuid default null
)
returns table (
  staff_id uuid,
  tenant_id text,
  user_id uuid,
  display_name text,
  reservable_resource_id uuid,
  status text,
  venue_ids uuid[],
  service_ids uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    staff.id,
    staff.tenant_id,
    staff.user_id,
    staff.display_name,
    staff.reservable_resource_id,
    staff.status,
    array(
      select assignment.venue_id
      from public.platform_staff_locations as assignment
      where assignment.staff_id = staff.id
      order by assignment.venue_id
    ),
    array(
      select assignment.service_id
      from public.platform_staff_services as assignment
      where assignment.staff_id = staff.id
      order by assignment.service_id
    )
  from public.platform_staff_profiles as staff
  where staff.tenant_id = p_tenant_id
    and (
      p_venue_id is null
      or exists (
        select 1
        from public.platform_staff_locations as assignment
        where assignment.staff_id = staff.id
          and assignment.venue_id = p_venue_id
      )
    )
  order by staff.display_name, staff.id;
$$;

create or replace function public.platform_create_staff_profile(
  p_tenant_id text,
  p_user_id uuid,
  p_display_name text,
  p_venue_ids uuid[],
  p_service_ids uuid[]
)
returns table (
  staff_id uuid,
  tenant_id text,
  user_id uuid,
  display_name text,
  reservable_resource_id uuid,
  status text,
  venue_ids uuid[],
  service_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid := gen_random_uuid();
  v_resource_id uuid := gen_random_uuid();
  v_venue_ids uuid[];
  v_service_ids uuid[];
  v_primary_service_id uuid;
  v_matching_count integer;
begin
  if length(trim(coalesce(p_display_name, ''))) = 0 then
    raise exception using errcode = '23514', message = 'Staff display name is required.';
  end if;

  select coalesce(array_agg(distinct venue_id order by venue_id), array[]::uuid[])
  into v_venue_ids
  from unnest(coalesce(p_venue_ids, array[]::uuid[])) as requested(venue_id);

  select coalesce(array_agg(distinct service_id order by service_id), array[]::uuid[])
  into v_service_ids
  from unnest(coalesce(p_service_ids, array[]::uuid[])) as requested(service_id);

  if cardinality(v_venue_ids) = 0 or cardinality(v_service_ids) = 0 then
    raise exception using errcode = '23514', message = 'Staff requires a location and service assignment.';
  end if;

  select count(*)::integer
  into v_matching_count
  from public.venues as venue
  where venue.id = any(v_venue_ids)
    and venue.tenant_id = p_tenant_id;
  if v_matching_count <> cardinality(v_venue_ids) then
    raise exception using errcode = '23514', message = 'Staff locations must belong to the staff tenant.';
  end if;

  select count(*)::integer
  into v_matching_count
  from public.services as service
  join public.venues as venue on venue.id = service.venue_id
  where service.id = any(v_service_ids)
    and venue.tenant_id = p_tenant_id;
  if v_matching_count <> cardinality(v_service_ids) then
    raise exception using errcode = '23514', message = 'Staff services must belong to the staff tenant.';
  end if;

  v_primary_service_id := v_service_ids[1];

  insert into public.reservable_resources (
    id, service_id, label, resource_kind, capacity, status, metadata
  ) values (
    v_resource_id,
    v_primary_service_id,
    trim(p_display_name) || ' [' || left(v_staff_id::text, 8) || ']',
    'custom',
    1,
    'available',
    jsonb_build_object(
      'platform_staff_id', v_staff_id::text,
      'practitioner_display_name', trim(p_display_name)
    )
  );

  insert into public.platform_staff_profiles (
    id, tenant_id, user_id, display_name, reservable_resource_id
  ) values (
    v_staff_id, p_tenant_id, p_user_id, trim(p_display_name), v_resource_id
  );

  insert into public.platform_staff_locations (staff_id, venue_id)
  select v_staff_id, venue_id from unnest(v_venue_ids) as assignments(venue_id);

  insert into public.platform_staff_services (staff_id, service_id)
  select v_staff_id, service_id from unnest(v_service_ids) as assignments(service_id);

  return query
  select listed.*
  from public.platform_list_staff_profiles(p_tenant_id, null) as listed
  where listed.staff_id = v_staff_id;
end;
$$;

create or replace function public.platform_update_staff_profile(
  p_staff_id uuid,
  p_display_name text,
  p_status text
)
returns table (
  staff_id uuid,
  tenant_id text,
  user_id uuid,
  display_name text,
  reservable_resource_id uuid,
  status text,
  venue_ids uuid[],
  service_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.platform_staff_profiles%rowtype;
begin
  if p_display_name is not null and length(trim(p_display_name)) = 0 then
    raise exception using errcode = '23514', message = 'Staff display name is invalid.';
  end if;
  if p_status is not null and p_status not in ('active', 'inactive') then
    raise exception using errcode = '23514', message = 'Staff status is invalid.';
  end if;

  select staff.* into v_staff
  from public.platform_staff_profiles as staff
  where staff.id = p_staff_id
  for update;
  if not found then return; end if;

  update public.platform_staff_profiles
  set display_name = coalesce(trim(p_display_name), display_name),
      status = coalesce(p_status, status)
  where id = p_staff_id
  returning * into v_staff;

  update public.reservable_resources
  set label = v_staff.display_name || ' [' || left(v_staff.id::text, 8) || ']',
      status = case when v_staff.status = 'active' then 'available' else 'inactive' end,
      metadata = metadata || jsonb_build_object('practitioner_display_name', v_staff.display_name)
  where id = v_staff.reservable_resource_id;

  return query
  select listed.*
  from public.platform_list_staff_profiles(v_staff.tenant_id, null) as listed
  where listed.staff_id = v_staff.id;
end;
$$;

create or replace function public.platform_assign_staff_locations(
  p_staff_id uuid,
  p_venue_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.platform_staff_profiles%rowtype;
  v_venue_ids uuid[];
begin
  select staff.* into v_staff
  from public.platform_staff_profiles as staff
  where staff.id = p_staff_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Staff profile not found.';
  end if;

  select coalesce(array_agg(distinct venue_id order by venue_id), array[]::uuid[])
  into v_venue_ids
  from unnest(coalesce(p_venue_ids, array[]::uuid[])) as requested(venue_id);

  if cardinality(v_venue_ids) = 0 then
    raise exception using errcode = '23514', message = 'Staff requires a location assignment.';
  end if;

  delete from public.platform_staff_locations where staff_id = p_staff_id;
  insert into public.platform_staff_locations (staff_id, venue_id)
  select p_staff_id, venue_id from unnest(v_venue_ids) as assignments(venue_id);
end;
$$;

create or replace function public.platform_assign_staff_services(
  p_staff_id uuid,
  p_service_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.platform_staff_profiles%rowtype;
  v_service_ids uuid[];
begin
  select staff.* into v_staff
  from public.platform_staff_profiles as staff
  where staff.id = p_staff_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Staff profile not found.';
  end if;

  select coalesce(array_agg(distinct service_id order by service_id), array[]::uuid[])
  into v_service_ids
  from unnest(coalesce(p_service_ids, array[]::uuid[])) as requested(service_id);

  if cardinality(v_service_ids) = 0 then
    raise exception using errcode = '23514', message = 'Staff requires a service assignment.';
  end if;

  delete from public.platform_staff_services where staff_id = p_staff_id;
  insert into public.platform_staff_services (staff_id, service_id)
  select p_staff_id, service_id from unnest(v_service_ids) as assignments(service_id);

  update public.reservable_resources
  set service_id = v_service_ids[1]
  where id = v_staff.reservable_resource_id;
end;
$$;

alter table public.platform_staff_profiles enable row level security;
alter table public.platform_staff_locations enable row level security;
alter table public.platform_staff_services enable row level security;

revoke all on table public.platform_staff_profiles from public, anon, authenticated;
revoke all on table public.platform_staff_locations from public, anon, authenticated;
revoke all on table public.platform_staff_services from public, anon, authenticated;

grant select, insert, update, delete on table public.platform_staff_profiles to service_role;
grant select, insert, update, delete on table public.platform_staff_locations to service_role;
grant select, insert, update, delete on table public.platform_staff_services to service_role;

revoke all on function public.platform_list_staff_profiles(text, uuid) from public, anon, authenticated;
revoke all on function public.platform_create_staff_profile(text, uuid, text, uuid[], uuid[]) from public, anon, authenticated;
revoke all on function public.platform_update_staff_profile(uuid, text, text) from public, anon, authenticated;
revoke all on function public.platform_assign_staff_locations(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.platform_assign_staff_services(uuid, uuid[]) from public, anon, authenticated;

grant execute on function public.platform_list_staff_profiles(text, uuid) to service_role;
grant execute on function public.platform_create_staff_profile(text, uuid, text, uuid[], uuid[]) to service_role;
grant execute on function public.platform_update_staff_profile(uuid, text, text) to service_role;
grant execute on function public.platform_assign_staff_locations(uuid, uuid[]) to service_role;
grant execute on function public.platform_assign_staff_services(uuid, uuid[]) to service_role;
