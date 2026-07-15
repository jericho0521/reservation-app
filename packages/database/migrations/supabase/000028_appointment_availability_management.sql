-- Practitioner-aware availability, buffered atomic booking, and customer-managed
-- rescheduling. Legacy services retain the existing reservation behavior.

alter function public.create_reservation_atomic(jsonb)
rename to create_reservation_atomic_legacy;

create or replace function public.create_reservation_atomic(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_staff public.platform_staff_profiles%rowtype;
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
  v_resource_label text;
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

  if not exists (
    select 1 from public.platform_staff_services as assignment
    where assignment.service_id = v_service.id
  ) then
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
  then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_reservation', 'message', 'Appointment details or duration are invalid');
  end if;

  select staff, resource.label
  into v_staff, v_resource_label
  from public.platform_staff_profiles as staff
  join public.reservable_resources as resource on resource.id = staff.reservable_resource_id
  where staff.id = v_staff_id
    and staff.status = 'active'
    and resource.status = 'available'
  for update of staff, resource;

  if not found
    or not exists (
      select 1
      from public.platform_staff_services as assignment
      where assignment.staff_id = v_staff_id and assignment.service_id = v_service.id
    )
    or not exists (
      select 1
      from public.platform_staff_locations as assignment
      where assignment.staff_id = v_staff_id and assignment.venue_id = v_service.venue_id
    )
  then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_staff', 'message', 'Practitioner is not assigned to this service and location');
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
    v_start_time, v_end_time, 1, array[v_resource_label], 'confirmed', v_interface_type, v_channel
  ) returning * into v_booking;

  insert into public.reservation_items (
    booking_id, service_id, resource_id, resource_label, quantity, metadata
  ) values (
    v_booking.id, v_service.id, v_staff.reservable_resource_id, v_resource_label, 1,
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
  v_resource_label text;
  v_timezone text;
  v_minimum_notice_minutes integer;
  v_end_time time;
  v_venue_id uuid;
  v_tenant_id text;
  v_starts_at timestamptz;
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

  select service, venue.id, venue.tenant_id,
    coalesce(settings.timezone, 'UTC'), coalesce(settings.minimum_notice_minutes, 0)
  into v_service, v_venue_id, v_tenant_id, v_timezone, v_minimum_notice_minutes
  from public.services as service
  join public.venues as venue on venue.id = service.venue_id
  left join public.platform_availability_settings as settings on settings.venue_id = venue.id
  where service.id = v_booking.service_id;

  v_end_time := p_start_time + make_interval(mins => v_service.duration_minutes);
  v_starts_at := (p_date + p_start_time) at time zone v_timezone;
  v_original_starts_at := (v_booking.booking_date + v_booking.start_time) at time zone v_timezone;
  if p_date is null or p_start_time is null or v_end_time <= p_start_time
    or v_starts_at < now() + make_interval(mins => v_minimum_notice_minutes)
    or v_original_starts_at < now() + make_interval(mins => v_minimum_notice_minutes)
  then
    return jsonb_build_object('ok', false, 'error_code', 'conflict', 'message', 'The reschedule cutoff has passed');
  end if;

  select staff, resource.label
  into v_staff, v_resource_label
  from public.platform_staff_profiles as staff
  join public.reservable_resources as resource on resource.id = staff.reservable_resource_id
  where staff.id = p_staff_id and staff.status = 'active'
    and resource.status = 'available'
  for update of staff, resource;
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

  v_before := to_jsonb(v_booking);
  update public.bookings
  set booking_date = p_date,
      start_time = p_start_time,
      end_time = v_end_time,
      staff_id = p_staff_id,
      seat_labels = array[v_resource_label]
  where id = v_booking.id
  returning * into v_booking;

  delete from public.reservation_items where booking_id = v_booking.id;
  insert into public.reservation_items (
    booking_id, service_id, resource_id, resource_label, quantity, metadata
  ) values (
    v_booking.id, v_service.id, v_staff.reservable_resource_id, v_resource_label, 1,
    jsonb_build_object('created_by', 'reschedule_managed_reservation', 'staff_id', v_staff.id)
  );

  insert into public.platform_audit_events (
    tenant_id, venue_id, action, entity_type, entity_id, before_value, after_value, reason
  ) values (
    v_tenant_id, v_venue_id, 'reservation.customer_rescheduled', 'booking', v_booking.id::text,
    v_before, to_jsonb(v_booking), 'customer_management_link'
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
      'duration_minutes', service.duration_minutes,
      'buffer_before_minutes', service.buffer_before_minutes,
      'buffer_after_minutes', service.buffer_after_minutes
    ),
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(booking) order by booking.start_time, booking.id)
      from public.bookings as booking
      where booking.service_id = service.id
        and booking.booking_date = p_date
        and booking.status in ('pending', 'confirmed')
    ), '[]'::jsonb),
    'maintenance', coalesce((
      select jsonb_agg(jsonb_build_object('seat_label', maintenance.seat_label) order by maintenance.seat_label)
      from public.service_seat_maintenance as maintenance
      where maintenance.service_id = service.id and maintenance.is_active = true
    ), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', resource.id,
        'service_id', resource.service_id,
        'label', resource.label,
        'kind', resource.resource_kind,
        'resource_kind', resource.resource_kind,
        'status', resource.status,
        'is_active', resource.status <> 'inactive',
        'capacity', resource.capacity,
        'metadata', resource.metadata
      ) order by resource.sort_order, resource.label, resource.id)
      from public.reservable_resources as resource
      where resource.service_id = service.id
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'staff_id', staff.id,
        'display_name', staff.display_name,
        'reservable_resource_id', staff.reservable_resource_id,
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

revoke all on function public.create_reservation_atomic_legacy(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_reservation_atomic(jsonb) from public, anon, authenticated;
revoke all on function public.reschedule_managed_reservation(text, text, date, time, uuid) from public, anon, authenticated;
revoke all on function public.read_reservation_availability_snapshot(uuid, date) from public, anon, authenticated;

grant execute on function public.create_reservation_atomic(jsonb) to service_role;
grant execute on function public.reschedule_managed_reservation(text, text, date, time, uuid) to service_role;
grant execute on function public.read_reservation_availability_snapshot(uuid, date) to service_role;
