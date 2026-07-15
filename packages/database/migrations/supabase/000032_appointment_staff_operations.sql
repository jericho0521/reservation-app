-- Server-authoritative appointment lifecycle and staff rescheduling.

create or replace function public.platform_transition_appointment(
  p_tenant_id text,
  p_venue_id uuid,
  p_actor_user_id uuid,
  p_booking_id uuid,
  p_expected_status text,
  p_target_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_before jsonb;
begin
  perform 1
  from public.platform_users as actor
  where actor.id = p_actor_user_id
    and actor.tenant_id = p_tenant_id
    and actor.status = 'active'
    and actor.role in ('owner', 'staff')
    and (
      actor.role = 'owner'
      or exists (
        select 1 from public.platform_user_venue_assignments as assignment
        where assignment.tenant_id = actor.tenant_id
          and assignment.user_id = actor.id
          and assignment.venue_id = p_venue_id
      )
    )
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  select booking.* into v_booking
  from public.bookings as booking
  join public.services as service on service.id = booking.service_id
  join public.venues as venue on venue.id = service.venue_id
  where booking.id = p_booking_id
    and venue.id = p_venue_id
    and venue.tenant_id = p_tenant_id
  for update of booking;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'not_found'); end if;
  if v_booking.status <> p_expected_status then
    return jsonb_build_object('ok', false, 'error_code', 'stale');
  end if;
  if not (
    (v_booking.status = 'pending' and p_target_status in ('confirmed', 'cancelled'))
    or (v_booking.status = 'confirmed' and p_target_status in ('completed', 'cancelled', 'no_show'))
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_transition');
  end if;
  if p_target_status in ('cancelled', 'no_show') and length(trim(coalesce(p_reason, ''))) = 0 then
    return jsonb_build_object('ok', false, 'error_code', 'reason_required');
  end if;

  v_before := jsonb_build_object(
    'status', v_booking.status,
    'date', v_booking.booking_date,
    'start_time', v_booking.start_time,
    'end_time', v_booking.end_time,
    'staff_id', v_booking.staff_id
  );
  update public.bookings
  set status = p_target_status,
      cancellation_reason = case when p_target_status = 'cancelled' then trim(p_reason) else cancellation_reason end,
      cancelled_by = case when p_target_status = 'cancelled' then p_actor_user_id::text else cancelled_by end,
      cancelled_at = case when p_target_status = 'cancelled' then now() else cancelled_at end,
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  insert into public.platform_audit_events (
    tenant_id, venue_id, actor_user_id, action, entity_type, entity_id,
    before_value, after_value, reason
  ) values (
    p_tenant_id, p_venue_id, p_actor_user_id,
    'reservation.status_changed', 'booking', v_booking.id::text,
    v_before,
    jsonb_build_object(
      'status', v_booking.status,
      'date', v_booking.booking_date,
      'start_time', v_booking.start_time,
      'end_time', v_booking.end_time,
      'staff_id', v_booking.staff_id
    ),
    nullif(trim(coalesce(p_reason, '')), '')
  );
  return jsonb_build_object('ok', true, 'booking', to_jsonb(v_booking));
end;
$$;

create or replace function public.platform_staff_reschedule_appointment(
  p_tenant_id text,
  p_venue_id uuid,
  p_actor_user_id uuid,
  p_booking_id uuid,
  p_expected_status text,
  p_date date,
  p_start_time time,
  p_staff_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_service public.services%rowtype;
  v_staff public.platform_staff_profiles%rowtype;
  v_resource public.reservable_resources%rowtype;
  v_timezone text;
  v_horizon integer;
  v_interval integer;
  v_notice integer;
  v_today date;
  v_end_time time;
  v_before jsonb;
begin
  perform 1
  from public.platform_users as actor
  where actor.id = p_actor_user_id and actor.tenant_id = p_tenant_id
    and actor.status = 'active' and actor.role in ('owner', 'staff')
    and (actor.role = 'owner' or exists (
      select 1 from public.platform_user_venue_assignments as assignment
      where assignment.tenant_id = actor.tenant_id and assignment.user_id = actor.id
        and assignment.venue_id = p_venue_id
    ))
  for share;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'forbidden'); end if;

  select booking, service
  into v_booking, v_service
  from public.bookings as booking
  join public.services as service on service.id = booking.service_id
  join public.venues as venue on venue.id = service.venue_id
  where booking.id = p_booking_id and venue.id = p_venue_id and venue.tenant_id = p_tenant_id
  for update of booking;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'not_found'); end if;
  if v_booking.status <> p_expected_status then return jsonb_build_object('ok', false, 'error_code', 'stale'); end if;
  if v_booking.status not in ('pending', 'confirmed') then return jsonb_build_object('ok', false, 'error_code', 'invalid_transition'); end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then return jsonb_build_object('ok', false, 'error_code', 'reason_required'); end if;

  select coalesce(settings.timezone, 'UTC'), coalesce(settings.booking_horizon_days, 60),
    coalesce(settings.slot_interval_minutes, 60), coalesce(settings.minimum_notice_minutes, 0)
  into v_timezone, v_horizon, v_interval, v_notice
  from public.venues as venue
  left join public.platform_availability_settings as settings
    on settings.tenant_id = venue.tenant_id and settings.venue_id = venue.id
  where venue.id = p_venue_id and venue.tenant_id = p_tenant_id;
  v_today := (now() at time zone v_timezone)::date;
  v_end_time := p_start_time + make_interval(mins => v_service.duration_minutes);
  if p_date < v_today or p_date > v_today + v_horizon
    or ((p_date + p_start_time) at time zone v_timezone) < now() + make_interval(mins => v_notice)
    or v_end_time <= p_start_time
    or exists (
      select 1 from public.platform_date_closures as closure
      where closure.tenant_id = p_tenant_id and closure.venue_id = p_venue_id
        and closure.closure_date = p_date
    )
    or not exists (
      select 1 from public.platform_operating_intervals as operating
      where operating.tenant_id = p_tenant_id and operating.venue_id = p_venue_id
        and operating.day_of_week = extract(dow from p_date)::integer
        and p_start_time >= operating.start_time and v_end_time <= operating.end_time
        and mod((extract(epoch from (p_start_time - operating.start_time)) / 60)::integer, v_interval) = 0
    )
  then return jsonb_build_object('ok', false, 'error_code', 'outside_availability'); end if;

  select staff, resource into v_staff, v_resource
  from public.platform_staff_profiles as staff
  join public.reservable_resources as resource on resource.id = staff.reservable_resource_id
  where staff.id = p_staff_id and staff.tenant_id = p_tenant_id
    and staff.status = 'active' and resource.status = 'available'
  for update of staff, resource;
  if not found or not exists (
    select 1 from public.platform_staff_services where staff_id = p_staff_id and service_id = v_service.id
  ) or not exists (
    select 1 from public.platform_staff_locations where staff_id = p_staff_id and venue_id = p_venue_id
  ) then return jsonb_build_object('ok', false, 'error_code', 'invalid_staff'); end if;
  if exists (
    select 1 from public.service_seat_maintenance as maintenance
    where maintenance.service_id = v_resource.service_id and maintenance.is_active = true
      and lower(maintenance.seat_label) = lower(v_resource.label)
  ) then return jsonb_build_object('ok', false, 'error_code', 'unavailable'); end if;
  if exists (
    select 1 from public.bookings as existing
    join public.services as existing_service on existing_service.id = existing.service_id
    where existing.id <> v_booking.id and existing.staff_id = p_staff_id
      and existing.booking_date = p_date and existing.status in ('pending', 'confirmed')
      and existing.start_time - make_interval(mins => existing_service.buffer_before_minutes)
        < v_end_time + make_interval(mins => v_service.buffer_after_minutes)
      and existing.end_time + make_interval(mins => existing_service.buffer_after_minutes)
        > p_start_time - make_interval(mins => v_service.buffer_before_minutes)
  ) then return jsonb_build_object('ok', false, 'error_code', 'conflict'); end if;

  v_before := jsonb_build_object(
    'status', v_booking.status,
    'date', v_booking.booking_date,
    'start_time', v_booking.start_time,
    'end_time', v_booking.end_time,
    'staff_id', v_booking.staff_id
  );
  update public.bookings set booking_date = p_date, start_time = p_start_time,
    end_time = v_end_time, staff_id = p_staff_id, seat_labels = array[v_resource.label], updated_at = now()
  where id = v_booking.id returning * into v_booking;
  delete from public.reservation_items where booking_id = v_booking.id;
  insert into public.reservation_items (booking_id, service_id, resource_id, resource_label, quantity, metadata)
  values (v_booking.id, v_service.id, v_resource.id, v_resource.label, 1,
    jsonb_build_object('created_by', 'platform_staff_reschedule_appointment', 'staff_id', p_staff_id));
  insert into public.platform_audit_events (
    tenant_id, venue_id, actor_user_id, action, entity_type, entity_id, before_value, after_value, reason
  ) values (
    p_tenant_id, p_venue_id, p_actor_user_id, 'reservation.staff_rescheduled', 'booking',
    v_booking.id::text,
    v_before,
    jsonb_build_object(
      'status', v_booking.status,
      'date', v_booking.booking_date,
      'start_time', v_booking.start_time,
      'end_time', v_booking.end_time,
      'staff_id', v_booking.staff_id
    ),
    trim(p_reason)
  );
  return jsonb_build_object('ok', true, 'booking', to_jsonb(v_booking));
end;
$$;

create or replace function public.platform_staff_create_appointment(
  p_tenant_id text,
  p_venue_id uuid,
  p_actor_user_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_booking jsonb;
begin
  perform 1
  from public.platform_users as actor
  where actor.id = p_actor_user_id
    and actor.tenant_id = p_tenant_id
    and actor.status = 'active'
    and actor.role in ('owner', 'staff')
    and (
      actor.role = 'owner'
      or exists (
        select 1 from public.platform_user_venue_assignments as assignment
        where assignment.tenant_id = actor.tenant_id
          and assignment.user_id = actor.id
          and assignment.venue_id = p_venue_id
      )
    )
  for share;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'forbidden'); end if;

  perform 1
  from public.services as service
  join public.venues as venue on venue.id = service.venue_id
  where service.id = nullif(p_payload ->> 'service_id', '')::uuid
    and service.venue_id = p_venue_id
    and venue.tenant_id = p_tenant_id
  for share of service, venue;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'invalid_service'); end if;

  v_result := public.create_reservation_atomic(
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('channel', 'staff')
  );
  if coalesce((v_result ->> 'ok')::boolean, false) = false then return v_result; end if;
  v_booking := v_result -> 'booking';

  insert into public.platform_audit_events (
    tenant_id, venue_id, actor_user_id, action, entity_type, entity_id, after_value, reason
  ) values (
    p_tenant_id,
    p_venue_id,
    p_actor_user_id,
    'reservation.staff_created',
    'booking',
    v_booking ->> 'id',
    jsonb_build_object(
      'status', v_booking ->> 'status',
      'date', v_booking ->> 'booking_date',
      'start_time', v_booking ->> 'start_time',
      'end_time', v_booking ->> 'end_time',
      'staff_id', v_booking ->> 'staff_id'
    ),
    'Created by staff'
  );
  return v_result;
exception
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_reservation');
end;
$$;

revoke all on function public.platform_transition_appointment(text, uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.platform_staff_reschedule_appointment(text, uuid, uuid, uuid, text, date, time, uuid, text) from public, anon, authenticated;
revoke all on function public.platform_staff_create_appointment(text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.platform_transition_appointment(text, uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.platform_staff_reschedule_appointment(text, uuid, uuid, uuid, text, date, time, uuid, text) to service_role;
grant execute on function public.platform_staff_create_appointment(text, uuid, uuid, jsonb) to service_role;
