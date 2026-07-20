-- Enforce published availability at the atomic write boundary for every booking mode.

create or replace function public.platform_create_scoped_reservation(
  p_venue_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_service_id uuid;
begin
  requested_service_id := nullif(p_payload ->> 'service_id', '')::uuid;

  perform 1
  from public.services
  where id = requested_service_id
    and venue_id = p_venue_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_service',
      'message', 'Service not found'
    );
  end if;

  return public.create_reservation_atomic(p_payload);
exception
  when invalid_text_representation then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_service',
      'message', 'Service not found'
    );
end;
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

  v_booking_date := nullif(payload ->> 'booking_date', '')::date;
  v_start_time := nullif(payload ->> 'start_time', '')::time;
  v_end_time := nullif(payload ->> 'end_time', '')::time;

  if v_booking_date is null
    or v_start_time is null
    or v_end_time is null
    or v_end_time <= v_start_time
    or extract(epoch from (v_end_time - v_start_time)) / 60 <> v_service.duration_minutes
  then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_reservation', 'message', 'Reservation time or duration is invalid');
  end if;

  if not public.platform_appointment_slot_is_allowed(
    v_service.venue_id, v_booking_date, v_start_time, v_end_time, now()
  ) then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'outside_availability',
      'message', 'Selected time is outside current availability'
    );
  end if;

  if v_service.booking_mode <> 'appointment' then
    return public.create_reservation_atomic_legacy(payload);
  end if;

  v_staff_id := nullif(payload ->> 'staff_id', '')::uuid;
  v_user_name := nullif(trim(coalesce(payload ->> 'user_name', '')), '');
  v_user_email := nullif(trim(coalesce(payload ->> 'user_email', '')), '');
  v_user_phone := nullif(trim(coalesce(payload ->> 'user_phone', '')), '');
  v_interface_type := coalesce(payload ->> 'interface_type', 'form');
  v_channel := coalesce(payload ->> 'channel', case when v_interface_type = 'chat' then 'web_chat' else 'web_booking' end);

  if v_staff_id is null
    or v_user_name is null
    or v_user_email is null
    or coalesce((payload ->> 'seats_booked')::integer, 0) <> 1
    or v_interface_type not in ('form', 'chat')
    or v_channel not in ('web_booking', 'web_chat', 'whatsapp', 'staff', 'simulation')
  then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_reservation', 'message', 'Appointment details are invalid');
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

revoke all on function public.create_reservation_atomic(jsonb) from public, anon, authenticated;
revoke all on function public.platform_create_scoped_reservation(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_reservation_atomic(jsonb) to service_role;
grant execute on function public.platform_create_scoped_reservation(uuid, jsonb) to service_role;
