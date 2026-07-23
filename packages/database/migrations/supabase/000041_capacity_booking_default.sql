-- Make pooled seat capacity the default for new single-business installations
-- while preserving configured appointment businesses.

-- The original capacity implementation groups reservations by exact start time.
-- Wrap it before enabling thirty-minute slot intervals so overlapping pooled
-- capacity reservations serialize on the service and share one capacity check.

alter function public.create_reservation_atomic_legacy(jsonb)
rename to create_reservation_atomic_legacy_exact_start;

create or replace function public.create_reservation_atomic_legacy(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_id uuid;
  v_booking_date date;
  v_start_time time;
  v_end_time time;
  v_requested_quantity integer;
  v_service public.services%rowtype;
  v_policy jsonb;
  v_policy_kind text;
  v_policy_max_quantity integer;
  v_capacity integer;
  v_booked_quantity integer;
  v_maintenance_quantity integer;
  v_resource_count integer;
  v_available_quantity integer;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    return public.create_reservation_atomic_legacy_exact_start(payload);
  end if;

  begin
    v_service_id := nullif(payload ->> 'service_id', '')::uuid;
    v_booking_date := nullif(payload ->> 'booking_date', '')::date;
    v_start_time := nullif(payload ->> 'start_time', '')::time;
    v_end_time := nullif(payload ->> 'end_time', '')::time;
    v_requested_quantity := nullif(payload ->> 'seats_booked', '')::integer;
  exception
    when invalid_text_representation
      or invalid_datetime_format
      or datetime_field_overflow
    then
      return public.create_reservation_atomic_legacy_exact_start(payload);
  end;

  if v_service_id is null
    or v_booking_date is null
    or v_start_time is null
    or v_end_time is null
    or v_requested_quantity is null
    or v_requested_quantity <= 0
    or v_end_time <= v_start_time
  then
    return public.create_reservation_atomic_legacy_exact_start(payload);
  end if;

  select service.*
  into v_service
  from public.services as service
  where service.id = v_service_id
  for update;

  if not found or v_service.selection_mode <> 'quantity' then
    return public.create_reservation_atomic_legacy_exact_start(payload);
  end if;

  perform 1
  from public.bookings as existing
  where existing.service_id = v_service.id
    and existing.booking_date = v_booking_date
    and existing.status in ('pending', 'confirmed')
    and existing.start_time < v_end_time
    and existing.end_time > v_start_time
  for update;

  v_policy := coalesce(v_service.reservation_policy, '{}'::jsonb);
  v_policy_kind := coalesce(v_policy ->> 'kind', 'capacity');
  v_policy_max_quantity := case
    when jsonb_typeof(v_policy -> 'max_quantity') = 'number'
      then (v_policy ->> 'max_quantity')::integer
    else v_service.total_seats
  end;

  if v_policy_kind = 'capacity' then
    v_capacity := coalesce(v_policy_max_quantity, v_service.total_seats);
  else
    select coalesce(sum(resource.capacity), 0)
    into v_capacity
    from public.reservable_resources as resource
    where resource.service_id = v_service.id
      and resource.status <> 'inactive';

    if v_capacity <= 0 then
      v_capacity := coalesce(v_policy_max_quantity, v_service.total_seats);
    end if;
  end if;

  select coalesce(sum(existing.seats_booked), 0)
  into v_booked_quantity
  from public.bookings as existing
  where existing.service_id = v_service.id
    and existing.booking_date = v_booking_date
    and existing.status in ('pending', 'confirmed')
    and existing.start_time < v_end_time
    and existing.end_time > v_start_time;

  select count(*)
  into v_resource_count
  from public.reservable_resources as resource
  where resource.service_id = v_service.id;

  if v_resource_count > 0 then
    select coalesce(sum(resource.capacity), 0)
    into v_maintenance_quantity
    from public.reservable_resources as resource
    where resource.service_id = v_service.id
      and resource.status <> 'inactive'
      and (
        resource.status = 'maintenance'
        or exists (
          select 1
          from public.service_seat_maintenance as maintenance
          where maintenance.service_id = v_service.id
            and maintenance.is_active = true
            and lower(maintenance.seat_label) = lower(resource.label)
        )
      );
  else
    select count(distinct lower(maintenance.seat_label))
    into v_maintenance_quantity
    from public.service_seat_maintenance as maintenance
    where maintenance.service_id = v_service.id
      and maintenance.is_active = true;
  end if;

  v_available_quantity := greatest(
    0,
    v_capacity - v_booked_quantity - coalesce(v_maintenance_quantity, 0)
  );
  if v_requested_quantity > v_available_quantity then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'not_enough_capacity',
      'message', 'Not enough capacity is available',
      'available_quantity', v_available_quantity
    );
  end if;

  return public.create_reservation_atomic_legacy_exact_start(payload);
end;
$$;

revoke all on function public.create_reservation_atomic_legacy_exact_start(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.create_reservation_atomic_legacy(jsonb)
  from public, anon, authenticated, service_role;

with converted as (
  update public.platform_business_profiles as business
  set preset_id = 'seat_capacity'
  where business.preset_id = 'appointments_salon'
    and business.status = 'draft'
    and not exists (
      select 1
      from public.services service
      where service.venue_id = business.venue_id
    )
    and not exists (
      select 1
      from public.platform_experience_configurations configuration
      where configuration.business_id = business.id
        and configuration.state = 'published'
    )
  returning business.id
)
update public.platform_experience_configurations as configuration
set preset_id = 'seat_capacity',
    terminology = jsonb_build_object(
      'customer', 'Customer',
      'resource', 'Seat',
      'booking', 'Reservation'
    )
where configuration.business_id in (select converted.id from converted)
  and configuration.state = 'draft';

create or replace function public.platform_read_installation_business(
  p_tenant_id text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with profile as (
    select business.*
    from public.platform_business_profiles business
    where business.tenant_id = p_tenant_id
    order by business.created_at, business.id
    limit 1
  )
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'business_id', profile.id,
      'tenant_id', profile.tenant_id,
      'venue_id', profile.venue_id,
      'name', profile.name,
      'public_slug', profile.public_slug,
      'preset_id', profile.preset_id,
      'status', profile.status
    ),
    'locations', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'location_id', location.location_id,
        'name', location.name,
        'address', location.address,
        'timezone', location.timezone
      )) order by location.location_id)
      from public.platform_list_installation_locations(p_tenant_id, null) location
    ), '[]'::jsonb)
  )
  from profile;
$$;

create or replace function public.platform_configure_installation_business(
  p_tenant_id text,
  p_owner_user_id uuid,
  p_name text,
  p_public_slug text,
  p_timezone text,
  p_location_name text,
  p_location_address text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.platform_business_profiles%rowtype;
  v_venue public.venues%rowtype;
  v_draft public.platform_experience_configurations%rowtype;
  v_version integer;
  v_terminology jsonb;
begin
  perform 1
  from public.tenants tenant
  where tenant.id = p_tenant_id
  for update;
  if not found then
    raise exception 'installation tenant does not exist';
  end if;

  if not exists (
    select 1
    from public.platform_users platform_user
    where platform_user.id = p_owner_user_id
      and platform_user.tenant_id = p_tenant_id
      and platform_user.role = 'owner'
      and platform_user.status = 'active'
  ) then
    raise exception 'active owner does not belong to tenant';
  end if;

  if trim(p_name) = '' or trim(p_location_name) = '' then
    raise exception 'business and location names are required';
  end if;
  if p_public_slug <> lower(trim(p_public_slug))
     or p_public_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid public slug';
  end if;
  if not exists (select 1 from pg_timezone_names where name = trim(p_timezone)) then
    raise exception 'invalid IANA timezone';
  end if;

  select business.* into v_profile
  from public.platform_business_profiles business
  where business.tenant_id = p_tenant_id
  order by business.created_at, business.id
  limit 1
  for update;

  if found then
    select venue.* into v_venue
    from public.venues venue
    where venue.tenant_id = p_tenant_id
      and venue.id = v_profile.venue_id
    for update;

    update public.venues
    set name = trim(p_location_name),
        address = nullif(trim(p_location_address), '')
    where id = v_venue.id
    returning * into v_venue;

    update public.platform_business_profiles
    set name = trim(p_name),
        public_slug = p_public_slug
    where id = v_profile.id
    returning * into v_profile;
  else
    insert into public.venues (tenant_id, name, address)
    values (p_tenant_id, trim(p_location_name), nullif(trim(p_location_address), ''))
    returning * into v_venue;

    insert into public.platform_business_profiles (
      tenant_id, venue_id, name, public_slug, preset_id, status
    ) values (
      p_tenant_id, v_venue.id, trim(p_name), p_public_slug, 'seat_capacity', 'draft'
    )
    returning * into v_profile;
  end if;

  update public.tenants
  set name = trim(p_name)
  where id = p_tenant_id;

  v_terminology := case v_profile.preset_id
    when 'appointments_salon' then jsonb_build_object(
      'customer', 'Client', 'resource', 'Practitioner', 'booking', 'Appointment'
    )
    when 'seat_capacity' then jsonb_build_object(
      'customer', 'Customer', 'resource', 'Seat', 'booking', 'Reservation'
    )
    else jsonb_build_object(
      'customer', 'Customer', 'resource', 'Resource', 'booking', 'Reservation'
    )
  end;

  select configuration.* into v_draft
  from public.platform_experience_configurations configuration
  where configuration.business_id = v_profile.id
    and configuration.state = 'draft'
  for update;

  if found then
    update public.platform_experience_configurations
    set preset_id = v_profile.preset_id,
        branding = coalesce(v_draft.branding, '{}'::jsonb)
          || jsonb_build_object('brand_name', trim(p_name)),
        terminology = coalesce(v_draft.terminology, v_terminology)
    where id = v_draft.id;
  else
    select coalesce(max(configuration.version), 0) + 1 into v_version
    from public.platform_experience_configurations configuration
    where configuration.business_id = v_profile.id;

    insert into public.platform_experience_configurations (
      business_id, version, state, preset_id, branding, terminology, channels
    ) values (
      v_profile.id,
      v_version,
      'draft',
      v_profile.preset_id,
      jsonb_build_object('brand_name', trim(p_name)),
      v_terminology,
      jsonb_build_object(
        'web_booking', true,
        'web_chat', false,
        'whatsapp', false
      )
    );
  end if;

  insert into public.platform_availability_settings (
    tenant_id, venue_id, timezone, booking_horizon_days,
    slot_interval_minutes, minimum_notice_minutes
  ) values (
    p_tenant_id, v_venue.id, trim(p_timezone), 60, 30, 0
  )
  on conflict (tenant_id, venue_id) do update
  set timezone = excluded.timezone;

  insert into public.platform_user_venue_assignments (tenant_id, user_id, venue_id)
  values (p_tenant_id, p_owner_user_id, v_venue.id)
  on conflict (user_id, venue_id) do nothing;

  return public.platform_read_installation_business(p_tenant_id);
end;
$$;

revoke all on function public.platform_read_installation_business(text) from public, anon, authenticated;
revoke all on function public.platform_configure_installation_business(text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.platform_read_installation_business(text) to service_role;
grant execute on function public.platform_configure_installation_business(text, uuid, text, text, text, text, text) to service_role;
