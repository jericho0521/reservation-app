-- Forward-only appointment correctness fixes for stable service mode,
-- practitioner maintenance, and cross-service availability.

alter table public.services
  add column if not exists booking_mode text not null default 'resource'
    check (booking_mode in ('resource', 'appointment'));

update public.services as service
set booking_mode = 'appointment'
from public.platform_business_profiles as profile
where profile.venue_id = service.venue_id
  and profile.preset_id = 'appointments_salon';

create or replace function public.platform_set_service_booking_mode()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.platform_business_profiles as profile
    where profile.venue_id = new.venue_id
      and profile.preset_id = 'appointments_salon'
  ) then
    new.booking_mode := 'appointment';
  end if;
  return new;
end;
$$;

create trigger platform_set_service_booking_mode
before insert or update of venue_id on public.services
for each row execute function public.platform_set_service_booking_mode();

create or replace function public.platform_sync_venue_service_booking_modes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.services
  set booking_mode = case when new.preset_id = 'appointments_salon' then 'appointment' else 'resource' end
  where venue_id = new.venue_id;
  return new;
end;
$$;

create trigger platform_sync_venue_service_booking_modes
after insert or update of preset_id, venue_id on public.platform_business_profiles
for each row execute function public.platform_sync_venue_service_booking_modes();

create or replace function public.platform_create_appointment_practitioner_resource(
  p_tenant_id text,
  p_venue_id uuid,
  p_service_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid := gen_random_uuid();
  v_resource_id uuid := gen_random_uuid();
  v_resource public.reservable_resources%rowtype;
begin
  if nullif(trim(p_display_name), '') is null then
    raise exception 'Practitioner display name is required.' using errcode = '23514';
  end if;

  perform 1
  from public.services as service
  join public.venues as venue on venue.id = service.venue_id
  where service.id = p_service_id
    and service.venue_id = p_venue_id
    and service.booking_mode = 'appointment'
    and venue.tenant_id = p_tenant_id
  for share of service, venue;
  if not found then
    raise exception 'Appointment service is outside the requested tenant and venue.' using errcode = '23514';
  end if;

  insert into public.reservable_resources (
    id, service_id, label, resource_kind, capacity, status, metadata
  ) values (
    v_resource_id,
    p_service_id,
    trim(p_display_name),
    'custom',
    1,
    'available',
    jsonb_build_object(
      'platform_staff_id', v_staff_id::text,
      'practitioner_display_name', trim(p_display_name)
    )
  ) returning * into v_resource;

  insert into public.platform_staff_profiles (
    id, tenant_id, display_name, reservable_resource_id
  ) values (
    v_staff_id, p_tenant_id, trim(p_display_name), v_resource.id
  );
  insert into public.platform_staff_locations (staff_id, venue_id)
  values (v_staff_id, p_venue_id);
  insert into public.platform_staff_services (staff_id, service_id)
  values (v_staff_id, p_service_id);

  return to_jsonb(v_resource);
end;
$$;

do $$
declare
  candidate record;
  v_staff_id uuid;
begin
  for candidate in
    select
      resource.id as resource_id,
      resource.label,
      service.id as service_id,
      service.venue_id,
      venue.tenant_id
    from public.reservable_resources as resource
    join public.services as service on service.id = resource.service_id
    join public.venues as venue on venue.id = service.venue_id
    left join public.platform_staff_profiles as staff
      on staff.reservable_resource_id = resource.id
    where service.booking_mode = 'appointment'
      and resource.resource_kind = 'custom'
      and resource.capacity = 1
      and staff.id is null
  loop
    v_staff_id := gen_random_uuid();
    update public.reservable_resources
    set metadata = metadata || jsonb_build_object(
      'platform_staff_id', v_staff_id::text,
      'practitioner_display_name', candidate.label
    )
    where id = candidate.resource_id;

    insert into public.platform_staff_profiles (
      id, tenant_id, display_name, reservable_resource_id
    ) values (
      v_staff_id, candidate.tenant_id, candidate.label, candidate.resource_id
    );
    insert into public.platform_staff_locations (staff_id, venue_id)
    values (v_staff_id, candidate.venue_id)
    on conflict do nothing;
    insert into public.platform_staff_services (staff_id, service_id)
    values (v_staff_id, candidate.service_id)
    on conflict do nothing;
  end loop;
end;
$$;

create or replace function public.platform_appointment_slot_is_allowed(
  p_venue_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_now timestamptz
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_availability_settings as settings
    where settings.venue_id = p_venue_id
      and p_date between (p_now at time zone settings.timezone)::date
        and (p_now at time zone settings.timezone)::date + settings.booking_horizon_days
      and (p_date + p_start_time) at time zone settings.timezone
        >= p_now + make_interval(mins => settings.minimum_notice_minutes)
      and not exists (
        select 1
        from public.platform_date_closures as closure
        where closure.tenant_id = settings.tenant_id
          and closure.venue_id = settings.venue_id
          and closure.closure_date = p_date
      )
      and exists (
        select 1
        from public.platform_operating_intervals as interval
        where interval.tenant_id = settings.tenant_id
          and interval.venue_id = settings.venue_id
          and interval.day_of_week = extract(dow from p_date)::integer
          and p_start_time >= interval.start_time
          and p_end_time <= interval.end_time
          and mod(
            (extract(epoch from (p_start_time - interval.start_time)) / 60)::integer,
            settings.slot_interval_minutes
          ) = 0
      )
  );
$$;

create or replace function public.create_reservation_atomic(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_staff public.platform_staff_profiles%rowtype;
  v_resource public.reservable_resources%rowtype;
  v_booking public.bookings%rowtype;
  v_staff_id uuid;
  v_service_id uuid;
  v_booking_date date;
  v_start_time time;
  v_end_time time;
  v_user_name text;
  v_user_email text;
  v_user_phone text;
  v_interface_type text;
  v_channel text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_reservation', 'message', 'Reservation payload must be a JSON object');
  end if;

  v_service_id := nullif(payload ->> 'service_id', '')::uuid;
  select service.* into v_service
  from public.services as service
  where service.id = v_service_id;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_service', 'message', 'Service not found');
  end if;

  if v_service.booking_mode <> 'appointment' then
    return public.create_reservation_atomic_legacy(payload);
  end if;

  v_staff_id := nullif(payload ->> 'staff_id', '')::uuid;
  v_booking_date := nullif(payload ->> 'booking_date', '')::date;
  v_start_time := nullif(payload ->> 'start_time', '')::time;
  v_end_time := nullif(payload ->> 'end_time', '')::time;
  v_user_name := nullif(trim(coalesce(payload ->> 'user_name', '')), '');
  v_user_email := nullif(trim(coalesce(payload ->> 'user_email', '')), '');
  v_user_phone := nullif(trim(coalesce(payload ->> 'user_phone', '')), '');
  v_interface_type := coalesce(payload ->> 'interface_type', 'form');
  v_channel := coalesce(payload ->> 'channel', case when v_interface_type = 'chat' then 'web_chat' else 'web_booking' end);

  if v_staff_id is null
    or v_booking_date is null
    or v_start_time is null
    or v_end_time is null
    or v_user_name is null
    or v_user_email is null
    or coalesce((payload ->> 'seats_booked')::integer, 0) <> 1
    or v_interface_type not in ('form', 'chat')
    or v_channel not in ('web_booking', 'web_chat', 'whatsapp', 'staff', 'simulation')
    or v_end_time <= v_start_time
    or extract(epoch from (v_end_time - v_start_time)) / 60 <> v_service.duration_minutes
    or not public.platform_appointment_slot_is_allowed(
      v_service.venue_id, v_booking_date, v_start_time, v_end_time, now()
    )
  then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_reservation', 'message', 'Appointment details or duration are invalid');
  end if;

  select staff.* into v_staff
  from public.platform_staff_profiles as staff
  where staff.id = v_staff_id
    and staff.status = 'active'
  for update of staff;

  select resource.* into v_resource
  from public.reservable_resources as resource
  where resource.id = v_staff.reservable_resource_id
    and resource.status = 'available'
  for update of resource;

  if not found
    or not exists (
      select 1 from public.platform_staff_services
      where staff_id = v_staff_id and service_id = v_service.id
    )
    or not exists (
      select 1 from public.platform_staff_locations
      where staff_id = v_staff_id and venue_id = v_service.venue_id
    )
  then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_staff', 'message', 'Practitioner is not assigned to this service and location');
  end if;

  if exists (
    select 1
    from public.service_seat_maintenance as maintenance
    where maintenance.service_id = v_resource.service_id
      and maintenance.seat_label = v_resource.label
      and maintenance.is_active = true
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'maintenance_conflict', 'message', 'Practitioner is unavailable');
  end if;

  if exists (
    select 1
    from public.bookings as existing
    join public.services as existing_service on existing_service.id = existing.service_id
    where existing.staff_id = v_staff_id
      and existing.booking_date = v_booking_date
      and existing.status in ('pending', 'confirmed')
      and existing.start_time - make_interval(mins => existing_service.buffer_before_minutes)
        < v_end_time + make_interval(mins => v_service.buffer_after_minutes)
      and existing.end_time + make_interval(mins => existing_service.buffer_after_minutes)
        > v_start_time - make_interval(mins => v_service.buffer_before_minutes)
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'resource_conflict', 'message', 'Practitioner is unavailable during the buffered interval');
  end if;

  insert into public.bookings (
    service_id, staff_id, user_name, user_email, user_phone, booking_date,
    start_time, end_time, seats_booked, seat_labels, status, interface_type, channel
  ) values (
    v_service.id, v_staff.id, v_user_name, v_user_email, v_user_phone, v_booking_date,
    v_start_time, v_end_time, 1, array[v_resource.label], 'confirmed', v_interface_type, v_channel
  ) returning * into v_booking;

  insert into public.reservation_items (
    booking_id, service_id, resource_id, resource_label, quantity, metadata
  ) values (
    v_booking.id, v_service.id, v_staff.reservable_resource_id, v_resource.label, 1,
    jsonb_build_object('created_by', 'create_reservation_atomic', 'staff_id', v_staff.id)
  );

  return jsonb_build_object(
    'ok', true,
    'atomic', true,
    'booking', to_jsonb(v_booking),
    'validation', jsonb_build_object('ok', true)
  );
exception
  when invalid_text_representation
    or invalid_datetime_format
    or datetime_field_overflow
    or not_null_violation
    or check_violation
  then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_reservation', 'message', 'Reservation payload contains invalid field values');
end;
$$;

create or replace function public.reschedule_managed_reservation(
  p_public_slug text,
  p_token_hash text,
  p_date date,
  p_start_time time,
  p_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.platform_reservation_management_tokens%rowtype;
  v_booking public.bookings%rowtype;
  v_service public.services%rowtype;
  v_staff public.platform_staff_profiles%rowtype;
  v_resource public.reservable_resources%rowtype;
  v_timezone text;
  v_minimum_notice_minutes integer;
  v_end_time time;
  v_venue_id uuid;
  v_tenant_id text;
  v_original_starts_at timestamptz;
  v_before jsonb;
begin
  select tokens.*
  into v_token
  from public.platform_reservation_management_tokens as tokens
  join public.bookings as booking on booking.id = tokens.booking_id
  join public.services as service on service.id = booking.service_id
  join public.platform_business_profiles as profile on profile.venue_id = service.venue_id
  where profile.public_slug = lower(trim(p_public_slug))
    and tokens.token_hash = lower(trim(p_token_hash))
  for update of tokens;

  if not found then return jsonb_build_object('ok', false, 'error_code', 'not_found'); end if;
  if v_token.expires_at <= now() then return jsonb_build_object('ok', false, 'error_code', 'expired'); end if;
  if v_token.revoked_at is not null then return jsonb_build_object('ok', false, 'error_code', 'revoked'); end if;

  select booking.* into v_booking
  from public.bookings as booking
  where booking.id = v_token.booking_id
  for update;
  if v_booking.status not in ('pending', 'confirmed') then
    return jsonb_build_object('ok', false, 'error_code', 'conflict', 'message', 'Reservation can no longer be rescheduled');
  end if;

  select service.* into v_service
  from public.services as service
  where service.id = v_booking.service_id;

  select venue.id, venue.tenant_id,
    coalesce(settings.timezone, 'UTC'), coalesce(settings.minimum_notice_minutes, 0)
  into v_venue_id, v_tenant_id, v_timezone, v_minimum_notice_minutes
  from public.venues as venue
  left join public.platform_availability_settings as settings on settings.venue_id = venue.id
  where venue.id = v_service.venue_id;

  if v_service.booking_mode <> 'appointment' then
    return jsonb_build_object('ok', false, 'error_code', 'conflict', 'message', 'Reservation is not an appointment');
  end if;

  v_end_time := p_start_time + make_interval(mins => v_service.duration_minutes);
  v_original_starts_at := (v_booking.booking_date + v_booking.start_time) at time zone v_timezone;
  if p_date is null
    or p_start_time is null
    or v_end_time <= p_start_time
    or v_original_starts_at < now() + make_interval(mins => v_minimum_notice_minutes)
    or not public.platform_appointment_slot_is_allowed(
      v_venue_id, p_date, p_start_time, v_end_time, now()
    )
  then
    return jsonb_build_object('ok', false, 'error_code', 'conflict', 'message', 'Appointment time is outside the booking policy');
  end if;

  select staff.* into v_staff
  from public.platform_staff_profiles as staff
  where staff.id = p_staff_id and staff.status = 'active'
  for update of staff;

  select resource.* into v_resource
  from public.reservable_resources as resource
  where resource.id = v_staff.reservable_resource_id and resource.status = 'available'
  for update of resource;
  if not found
    or not exists (
      select 1 from public.platform_staff_services
      where staff_id = p_staff_id and service_id = v_service.id
    )
    or not exists (
      select 1 from public.platform_staff_locations
      where staff_id = p_staff_id and venue_id = v_venue_id
    )
  then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_staff', 'message', 'Practitioner is not assigned to this service and location');
  end if;

  if exists (
    select 1
    from public.service_seat_maintenance as maintenance
    where maintenance.service_id = v_resource.service_id
      and maintenance.seat_label = v_resource.label
      and maintenance.is_active = true
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'conflict', 'message', 'Practitioner is unavailable');
  end if;

  if exists (
    select 1
    from public.bookings as existing
    join public.services as existing_service on existing_service.id = existing.service_id
    where existing.id <> v_booking.id
      and existing.staff_id = p_staff_id
      and existing.booking_date = p_date
      and existing.status in ('pending', 'confirmed')
      and existing.start_time - make_interval(mins => existing_service.buffer_before_minutes)
        < v_end_time + make_interval(mins => v_service.buffer_after_minutes)
      and existing.end_time + make_interval(mins => existing_service.buffer_after_minutes)
        > p_start_time - make_interval(mins => v_service.buffer_before_minutes)
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'conflict', 'message', 'Practitioner is unavailable during the buffered interval');
  end if;

  v_before := jsonb_build_object(
    'date', v_booking.booking_date,
    'start_time', v_booking.start_time,
    'end_time', v_booking.end_time,
    'staff_id', v_booking.staff_id,
    'status', v_booking.status
  );
  update public.bookings
  set booking_date = p_date,
      start_time = p_start_time,
      end_time = v_end_time,
      staff_id = p_staff_id,
      seat_labels = array[v_resource.label]
  where id = v_booking.id
  returning * into v_booking;

  delete from public.reservation_items where booking_id = v_booking.id;
  insert into public.reservation_items (
    booking_id, service_id, resource_id, resource_label, quantity, metadata
  ) values (
    v_booking.id, v_service.id, v_staff.reservable_resource_id, v_resource.label, 1,
    jsonb_build_object('created_by', 'reschedule_managed_reservation', 'staff_id', v_staff.id)
  );

  insert into public.platform_audit_events (
    tenant_id, venue_id, action, entity_type, entity_id, before_value, after_value, reason
  ) values (
    v_tenant_id, v_venue_id, 'reservation.customer_rescheduled', 'booking', v_booking.id::text,
    v_before,
    jsonb_build_object(
      'date', v_booking.booking_date,
      'start_time', v_booking.start_time,
      'end_time', v_booking.end_time,
      'staff_id', v_booking.staff_id,
      'status', v_booking.status
    ),
    'customer_management_link'
  );

  return jsonb_build_object('ok', true, 'booking', to_jsonb(v_booking));
end;
$$;

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
      'id', service.id,
      'venue_id', service.venue_id,
      'name', service.name,
      'description', service.description,
      'total_seats', service.total_seats,
      'created_at', service.created_at,
      'resource_kind', service.resource_kind,
      'selection_mode', service.selection_mode,
      'reservation_policy', service.reservation_policy,
      'metadata', service.metadata,
      'booking_mode', service.booking_mode,
      'duration_minutes', service.duration_minutes,
      'buffer_before_minutes', service.buffer_before_minutes,
      'buffer_after_minutes', service.buffer_after_minutes
    ),
    'bookings', coalesce((
      select jsonb_agg(
        to_jsonb(booking) || jsonb_build_object(
          'buffer_before_minutes', booked_service.buffer_before_minutes,
          'buffer_after_minutes', booked_service.buffer_after_minutes
        ) order by booking.start_time, booking.id
      )
      from public.bookings as booking
      join public.services as booked_service on booked_service.id = booking.service_id
      where booking.booking_date = p_date
        and booking.status in ('pending', 'confirmed')
        and (
          booking.service_id = service.id
          or booking.staff_id in (
            select staff_service.staff_id
            from public.platform_staff_services as staff_service
            where staff_service.service_id = service.id
          )
        )
    ), '[]'::jsonb),
    'maintenance', coalesce((
      select jsonb_agg(jsonb_build_object('seat_label', maintenance.seat_label) order by maintenance.seat_label)
      from public.service_seat_maintenance as maintenance
      join public.reservable_resources as maintained_resource
        on maintained_resource.service_id = maintenance.service_id
       and maintained_resource.label = maintenance.seat_label
      where maintenance.is_active = true
        and (
          maintenance.service_id = service.id
          or maintained_resource.id in (
            select staff.reservable_resource_id
            from public.platform_staff_profiles as staff
            join public.platform_staff_services as staff_service on staff_service.staff_id = staff.id
            where staff_service.service_id = service.id
          )
        )
    ), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', projected.id,
        'service_id', projected.service_id,
        'label', projected.label,
        'kind', projected.resource_kind,
        'resource_kind', projected.resource_kind,
        'status', projected.status,
        'is_active', projected.status <> 'inactive',
        'capacity', projected.capacity,
        'metadata', projected.metadata
      ) order by projected.sort_order, projected.label, projected.id)
      from (
        select
          resource.id, resource.service_id, resource.label, resource.resource_kind,
          resource.status, resource.capacity, resource.metadata, resource.sort_order
        from public.reservable_resources as resource
        where resource.service_id = service.id
        union all
        select
          resource.id, service.id, resource.label, resource.resource_kind,
          resource.status, resource.capacity,
          resource.metadata || jsonb_build_object(
            'platform_staff_id', staff.id::text,
            'practitioner_display_name', staff.display_name
          ), resource.sort_order
        from public.platform_staff_profiles as staff
        join public.reservable_resources as resource on resource.id = staff.reservable_resource_id
        join public.platform_staff_services as staff_service
          on staff_service.staff_id = staff.id and staff_service.service_id = service.id
        join public.platform_staff_locations as staff_location
          on staff_location.staff_id = staff.id and staff_location.venue_id = service.venue_id
        where staff.status = 'active'
          and resource.service_id <> service.id
      ) as projected
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'staff_id', staff.id,
        'display_name', staff.display_name,
        'reservable_resource_id', staff.reservable_resource_id,
        'resource_label', resource.label,
        'resource_status', resource.status
      ) order by staff.display_name, staff.id)
      from public.platform_staff_profiles as staff
      join public.reservable_resources as resource on resource.id = staff.reservable_resource_id
      join public.platform_staff_services as staff_service
        on staff_service.staff_id = staff.id and staff_service.service_id = service.id
      join public.platform_staff_locations as staff_location
        on staff_location.staff_id = staff.id and staff_location.venue_id = service.venue_id
      where staff.status = 'active'
    ), '[]'::jsonb),
    'layout', (
      select jsonb_build_object('layout_kind', layout.layout_kind, 'metadata', layout.metadata)
      from public.resource_layouts as layout
      where layout.service_id = service.id and layout.is_active = true
    ),
    'operating_hours', public.read_experience_operating_hours(venue.tenant_id, venue.id)
  )
  from public.services as service
  join public.venues as venue on venue.id = service.venue_id
  where service.id = p_service_id;
$$;

create or replace function public.read_managed_reservation_availability_snapshot(
  p_public_slug text,
  p_token_hash text,
  p_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_managed jsonb;
  v_booking_id uuid;
  v_service_id uuid;
  v_snapshot jsonb;
  v_filtered_bookings jsonb;
begin
  v_managed := public.read_managed_reservation(p_public_slug, p_token_hash);
  if coalesce((v_managed ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error_code', coalesce(v_managed ->> 'error_code', 'not_found'));
  end if;

  v_booking_id := (v_managed -> 'booking' ->> 'id')::uuid;
  v_service_id := (v_managed -> 'booking' ->> 'service_id')::uuid;
  v_snapshot := public.read_reservation_availability_snapshot(v_service_id, p_date);
  if v_snapshot is null then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  select coalesce(jsonb_agg(entry), '[]'::jsonb)
  into v_filtered_bookings
  from jsonb_array_elements(v_snapshot -> 'bookings') as entry
  where entry ->> 'id' <> v_booking_id::text;

  return jsonb_build_object(
    'ok', true,
    'snapshot', jsonb_set(v_snapshot, '{bookings}', v_filtered_bookings, false)
  );
exception
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
end;
$$;

revoke all on function public.create_reservation_atomic(jsonb) from public, anon, authenticated;
revoke all on function public.read_reservation_availability_snapshot(uuid, date) from public, anon, authenticated;
revoke all on function public.read_managed_reservation_availability_snapshot(text, text, date) from public, anon, authenticated;
revoke all on function public.reschedule_managed_reservation(text, text, date, time, uuid) from public, anon, authenticated;
revoke all on function public.platform_create_appointment_practitioner_resource(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_reservation_atomic(jsonb) to service_role;
grant execute on function public.read_reservation_availability_snapshot(uuid, date) to service_role;
grant execute on function public.read_managed_reservation_availability_snapshot(text, text, date) to service_role;
grant execute on function public.reschedule_managed_reservation(text, text, date, time, uuid) to service_role;
grant execute on function public.platform_create_appointment_practitioner_resource(text, uuid, uuid, text) to service_role;
