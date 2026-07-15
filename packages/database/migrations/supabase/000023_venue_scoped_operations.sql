-- Enforce venue ownership inside service-role reservation and maintenance mutations.

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
  for share;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_service',
      'message', 'Service not found'
    );
  end if;

  return public.create_reservation_atomic(p_payload);
end;
$$;

create or replace function public.platform_update_scoped_reservation(
  p_venue_id uuid,
  p_reservation_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_booking public.bookings%rowtype;
  updated_booking public.bookings%rowtype;
  target_service_id uuid;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return null;
  end if;

  select booking.* into current_booking
  from public.bookings as booking
  join public.services as current_service on current_service.id = booking.service_id
  where booking.id = p_reservation_id
    and current_service.venue_id = p_venue_id
  for update of booking, current_service;

  if not found then
    return null;
  end if;

  target_service_id := case
    when p_patch ? 'service_id' then nullif(p_patch ->> 'service_id', '')::uuid
    else current_booking.service_id
  end;

  perform 1
  from public.services
  where id = target_service_id
    and venue_id = p_venue_id
  for share;

  if not found then
    return null;
  end if;

  update public.bookings
  set service_id = target_service_id,
      user_name = case when p_patch ? 'user_name' then p_patch ->> 'user_name' else current_booking.user_name end,
      user_email = case when p_patch ? 'user_email' then p_patch ->> 'user_email' else current_booking.user_email end,
      user_phone = case when p_patch ? 'user_phone' then nullif(p_patch ->> 'user_phone', '') else current_booking.user_phone end,
      booking_date = case when p_patch ? 'booking_date' then (p_patch ->> 'booking_date')::date else current_booking.booking_date end,
      start_time = case when p_patch ? 'start_time' then (p_patch ->> 'start_time')::time else current_booking.start_time end,
      end_time = case when p_patch ? 'end_time' then (p_patch ->> 'end_time')::time else current_booking.end_time end,
      seats_booked = case when p_patch ? 'seats_booked' then (p_patch ->> 'seats_booked')::integer else current_booking.seats_booked end,
      seat_labels = case
        when p_patch ? 'seat_labels' then array(select jsonb_array_elements_text(p_patch -> 'seat_labels'))
        else current_booking.seat_labels
      end,
      status = case when p_patch ? 'status' then p_patch ->> 'status' else current_booking.status end,
      interface_type = case when p_patch ? 'interface_type' then p_patch ->> 'interface_type' else current_booking.interface_type end,
      cancellation_reason = case when p_patch ? 'cancellation_reason' then p_patch ->> 'cancellation_reason' else current_booking.cancellation_reason end,
      cancelled_by = case when p_patch ? 'cancelled_by' then p_patch ->> 'cancelled_by' else current_booking.cancelled_by end,
      cancelled_at = case when p_patch ? 'cancelled_at' then (p_patch ->> 'cancelled_at')::timestamptz else current_booking.cancelled_at end,
      updated_at = case when p_patch ? 'updated_at' then (p_patch ->> 'updated_at')::timestamptz else now() end
  where id = current_booking.id
  returning * into updated_booking;

  return to_jsonb(updated_booking);
end;
$$;

create or replace function public.platform_create_scoped_maintenance(
  p_venue_id uuid,
  p_row jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_service_id uuid;
  maintenance public.service_seat_maintenance%rowtype;
begin
  requested_service_id := nullif(p_row ->> 'service_id', '')::uuid;

  perform 1
  from public.services
  where id = requested_service_id
    and venue_id = p_venue_id
  for share;

  if not found then
    return null;
  end if;

  insert into public.service_seat_maintenance (
    service_id, seat_label, reason, is_active
  ) values (
    requested_service_id,
    p_row ->> 'seat_label',
    p_row ->> 'reason',
    true
  )
  on conflict (service_id, seat_label) do update
  set reason = excluded.reason,
      is_active = true
  returning * into maintenance;

  return to_jsonb(maintenance);
end;
$$;

create or replace function public.platform_end_scoped_maintenance(
  p_venue_id uuid,
  p_maintenance_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  maintenance public.service_seat_maintenance%rowtype;
begin
  select candidate.* into maintenance
  from public.service_seat_maintenance as candidate
  join public.services as scoped_service on scoped_service.id = candidate.service_id
  where candidate.id = p_maintenance_id
    and scoped_service.venue_id = p_venue_id
  for update of candidate, scoped_service;

  if not found then
    return null;
  end if;

  update public.service_seat_maintenance
  set is_active = false,
      reason = coalesce(p_reason, maintenance.reason)
  where id = maintenance.id
  returning * into maintenance;

  return to_jsonb(maintenance);
end;
$$;

revoke all on function public.platform_create_scoped_reservation(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.platform_update_scoped_reservation(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.platform_create_scoped_maintenance(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.platform_end_scoped_maintenance(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.platform_create_scoped_reservation(uuid, jsonb) to service_role;
grant execute on function public.platform_update_scoped_reservation(uuid, uuid, jsonb) to service_role;
grant execute on function public.platform_create_scoped_maintenance(uuid, jsonb) to service_role;
grant execute on function public.platform_end_scoped_maintenance(uuid, uuid, text) to service_role;
