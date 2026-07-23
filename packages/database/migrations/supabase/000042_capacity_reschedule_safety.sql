-- Preserve the operational channel when the generic capacity implementation
-- creates a booking. The original function predates the booking channel column.

alter function public.create_reservation_atomic_legacy(jsonb)
rename to create_reservation_atomic_legacy_without_channel;

create or replace function public.create_reservation_atomic_legacy(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_channel text;
  v_booking_id uuid;
  v_booking jsonb;
begin
  v_result := public.create_reservation_atomic_legacy_without_channel(payload);
  if coalesce((v_result ->> 'ok')::boolean, false) = false then
    return v_result;
  end if;

  v_channel := nullif(payload ->> 'channel', '');
  if v_channel is null
    or v_channel not in ('web_booking', 'web_chat', 'whatsapp', 'staff', 'simulation')
  then
    return v_result;
  end if;

  v_booking_id := nullif(v_result #>> '{booking,id}', '')::uuid;
  if v_booking_id is null then
    return v_result;
  end if;

  update public.bookings as booking
  set channel = v_channel
  where booking.id = v_booking_id
  returning to_jsonb(booking) into v_booking;

  if v_booking is not null then
    v_result := jsonb_set(v_result, '{booking}', v_booking, true);
  end if;
  return v_result;
end;
$$;

revoke all on function public.create_reservation_atomic_legacy_without_channel(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.create_reservation_atomic_legacy(jsonb)
  from public, anon, authenticated, service_role;

-- Reservations created by an owner persist channel = 'staff'. Keep that
-- authoritative value when analytics has no linked conversation instead of
-- treating every form-created reservation as a web booking.

create or replace function public.read_platform_analytics(
  p_tenant_id text,
  p_venue_id uuid,
  p_from_date date,
  p_to_date date,
  p_include_simulation boolean default false
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_timezone text;
  v_result jsonb;
begin
  if p_from_date is null or p_to_date is null or p_from_date > p_to_date or p_to_date - p_from_date > 365 then
    raise exception 'Analytics date range must be between 1 and 366 days.' using errcode = '22023';
  end if;

  select coalesce(settings.timezone, 'UTC') into v_timezone
  from public.venues venue
  left join public.platform_availability_settings settings
    on settings.tenant_id = venue.tenant_id and settings.venue_id = venue.id
  where venue.tenant_id = p_tenant_id and venue.id = p_venue_id;
  if not found then raise exception 'Venue not found.' using errcode = 'P0002'; end if;

  with venue_services as (
    select service.id, service.name
    from public.services service
    where service.venue_id = p_venue_id
  ), scoped_conversations as (
    select conversation.*
    from public.platform_conversations conversation
    where conversation.tenant_id = p_tenant_id
      and conversation.venue_id = p_venue_id
      and (conversation.created_at at time zone v_timezone)::date between p_from_date and p_to_date
      and (p_include_simulation or conversation.channel <> 'simulation')
  ), scoped_messages as (
    select message.*
    from public.platform_conversation_messages message
    join scoped_conversations conversation on conversation.id = message.conversation_id
  ), scoped_bookings as (
    select booking.*, venue_service.name as service_name,
      case
        when conversation.channel is not null then conversation.channel
        when booking.channel in ('web_booking', 'web_chat', 'whatsapp', 'staff', 'simulation') then booking.channel
        else 'web_booking'
      end as analytics_channel
    from public.bookings booking
    join venue_services venue_service on venue_service.id = booking.service_id
    left join lateral (
      select candidate.channel
      from public.platform_conversations candidate
      where candidate.reservation_id = booking.id
        and candidate.tenant_id = p_tenant_id
        and candidate.venue_id = p_venue_id
      order by candidate.updated_at desc
      limit 1
    ) conversation on true
    where booking.booking_date between p_from_date and p_to_date
      and (p_include_simulation or coalesce(conversation.channel, booking.channel, '') <> 'simulation')
  ), reservation_totals as (
    select count(*)::integer as total,
      count(*) filter (where status = 'cancelled')::integer as cancelled,
      count(*) filter (where status = 'no_show')::integer as no_show,
      count(*) filter (where status in ('completed', 'no_show'))::integer as attended_outcomes
    from scoped_bookings
  ), funnel as (
    select
      (select count(*)::integer from scoped_conversations) as conversations_started,
      count(distinct conversation_id) filter (where metadata->>'event' = 'booking.proposed')::integer as proposal_shown,
      count(distinct conversation_id) filter (where metadata->>'event' = 'booking.confirmation_requested')::integer as confirmation_requested,
      count(distinct conversation_id) filter (where metadata->>'event' = 'booking.confirmed')::integer as reservations_created
    from scoped_messages
  ), open_minutes as (
    select coalesce(sum(extract(epoch from (intervals.end_time - intervals.start_time)) / 60), 0)::integer as minutes
    from generate_series(p_from_date, p_to_date, interval '1 day') calendar(day)
    join public.platform_operating_intervals intervals
      on intervals.tenant_id = p_tenant_id
      and intervals.venue_id = p_venue_id
      and intervals.day_of_week = extract(dow from calendar.day)::integer
    where not exists (
      select 1 from public.platform_date_closures closure
      where closure.tenant_id = p_tenant_id
        and closure.venue_id = p_venue_id
        and closure.closure_date = calendar.day::date
    )
  ), staff_utilization as (
    select staff.id as staff_id, staff.display_name,
      coalesce(sum(extract(epoch from (booking.end_time - booking.start_time)) / 60)
        filter (where booking.status <> 'cancelled'), 0)::integer as booked_minutes,
      open_minutes.minutes as available_minutes
    from public.platform_staff_profiles staff
    join public.platform_staff_locations assignment
      on assignment.staff_id = staff.id and assignment.venue_id = p_venue_id
    cross join open_minutes
    left join scoped_bookings booking on booking.staff_id = staff.id
    where staff.tenant_id = p_tenant_id and staff.status = 'active'
    group by staff.id, staff.display_name, open_minutes.minutes
    order by booked_minutes desc, staff.display_name, staff.id
    limit 50
  )
  select jsonb_build_object(
    'generated_at', now(), 'timezone', v_timezone, 'from_date', p_from_date, 'to_date', p_to_date,
    'include_simulation', p_include_simulation,
    'totals', jsonb_build_object(
      'reservations', reservation_totals.total,
      'cancelled', reservation_totals.cancelled,
      'cancellation_rate', case when reservation_totals.total = 0 then 0 else round(reservation_totals.cancelled::numeric / reservation_totals.total, 4) end
    ),
    'reservations_by_day', coalesce((select jsonb_agg(row order by date) from (
      select booking_date as date, count(*)::integer as total,
        count(*) filter (where status = 'confirmed')::integer as confirmed,
        count(*) filter (where status = 'completed')::integer as completed,
        count(*) filter (where status = 'cancelled')::integer as cancelled
      from scoped_bookings group by booking_date
    ) row), '[]'::jsonb),
    'reservations_by_status', coalesce((select jsonb_agg(row order by status) from (
      select status, count(*)::integer as count from scoped_bookings group by status limit 50
    ) row), '[]'::jsonb),
    'reservations_by_channel', coalesce((select jsonb_agg(row order by channel) from (
      select analytics_channel as channel, count(*)::integer as count
      from scoped_bookings group by analytics_channel limit 50
    ) row), '[]'::jsonb),
    'channel_performance', coalesce((select jsonb_agg(row order by channel) from (
      select conversation.channel,
        count(distinct conversation.id)::integer as conversations_started,
        count(distinct message.conversation_id) filter (where message.metadata->>'event' = 'booking.proposed')::integer as proposal_shown,
        count(distinct message.conversation_id) filter (where message.metadata->>'event' = 'booking.confirmation_requested')::integer as confirmation_requested,
        count(distinct message.conversation_id) filter (where message.metadata->>'event' = 'booking.confirmed')::integer as reservations_created,
        case when count(distinct conversation.id) = 0 then 0 else round(count(distinct message.conversation_id) filter (where message.metadata->>'event' = 'booking.confirmed')::numeric / count(distinct conversation.id), 4) end as conversion_rate
      from scoped_conversations conversation
      left join scoped_messages message on message.conversation_id = conversation.id
      group by conversation.channel limit 50
    ) row), '[]'::jsonb),
    'reservations_by_service', coalesce((select jsonb_agg(row order by count desc, service_name) from (
      select service_id, service_name, count(*)::integer as count
      from scoped_bookings group by service_id, service_name order by count(*) desc, service_name limit 20
    ) row), '[]'::jsonb),
    'popular_slots', coalesce((select jsonb_agg(row order by count desc, day_of_week, start_time) from (
      select extract(isodow from booking_date)::integer as day_of_week, start_time::text, count(*)::integer as count
      from scoped_bookings where status <> 'cancelled'
      group by extract(isodow from booking_date), start_time order by count(*) desc, start_time limit 20
    ) row), '[]'::jsonb),
    'practitioner_utilization', coalesce((select jsonb_agg(jsonb_build_object(
      'staff_id', staff_id, 'display_name', display_name,
      'booked_minutes', booked_minutes, 'available_minutes', available_minutes,
      'utilization_rate', case when available_minutes = 0 then 0 else least(1, round(booked_minutes::numeric / available_minutes, 4)) end
    ) order by booked_minutes desc, display_name) from staff_utilization), '[]'::jsonb),
    'locations', jsonb_build_array(jsonb_build_object(
      'venue_id', p_venue_id,
      'name', (select venue.name from public.venues venue where venue.id = p_venue_id and venue.tenant_id = p_tenant_id),
      'reservations', reservation_totals.total
    )),
    'no_show_rate', case when reservation_totals.attended_outcomes = 0 then 0 else round(reservation_totals.no_show::numeric / reservation_totals.attended_outcomes, 4) end,
    'funnel', to_jsonb(funnel),
    'automation', jsonb_build_object(
      'automated_conversations', (select count(*) filter (where automation_state = 'automated')::integer from scoped_conversations),
      'staff_takeovers', (select count(*) filter (where automation_state = 'manual')::integer from scoped_conversations),
      'containment_rate', case when funnel.conversations_started = 0 then 0 else round((funnel.conversations_started - (select count(*) filter (where automation_state = 'manual') from scoped_conversations))::numeric / funnel.conversations_started, 4) end,
      'takeover_rate', case when funnel.conversations_started = 0 then 0 else round((select count(*) filter (where automation_state = 'manual') from scoped_conversations)::numeric / funnel.conversations_started, 4) end
    )
  ) into v_result
  from reservation_totals, funnel;

  return v_result;
end;
$$;

revoke all on function public.read_platform_analytics(text, uuid, date, date, boolean)
  from public, anon, authenticated;
grant execute on function public.read_platform_analytics(text, uuid, date, date, boolean)
  to service_role;

-- Capacity reservations must be rescheduled through the same availability and
-- capacity boundary used for creation, with the owner action recorded atomically.

create or replace function public.platform_staff_reschedule_capacity_reservation(
  p_tenant_id text,
  p_venue_id uuid,
  p_actor_user_id uuid,
  p_booking_id uuid,
  p_expected_status text,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_quantity integer,
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
  v_before jsonb;
  v_policy jsonb;
  v_capacity integer;
  v_booked_quantity integer;
  v_maintenance_quantity integer;
  v_available_quantity integer;
  v_resource_count integer;
  v_capacity_bucket_id uuid;
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
        select 1
        from public.platform_user_venue_assignments as assignment
        where assignment.tenant_id = actor.tenant_id
          and assignment.user_id = actor.id
          and assignment.venue_id = p_venue_id
      )
    )
  for share;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  select service.*
  into v_service
  from public.services as service
  join public.bookings as booking on booking.service_id = service.id
  join public.venues as venue on venue.id = service.venue_id
  where booking.id = p_booking_id
    and venue.id = p_venue_id
    and venue.tenant_id = p_tenant_id
  for update of service;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  select booking.*
  into v_booking
  from public.bookings as booking
  where booking.id = p_booking_id
    and booking.service_id = v_service.id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  if v_booking.status <> p_expected_status then
    return jsonb_build_object('ok', false, 'error_code', 'stale');
  end if;
  if v_booking.status not in ('pending', 'confirmed') then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_transition');
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    return jsonb_build_object('ok', false, 'error_code', 'reason_required');
  end if;
  if v_booking.staff_id is not null
    or v_service.booking_mode = 'appointment'
    or v_service.selection_mode <> 'quantity'
    or cardinality(coalesce(v_booking.seat_labels, '{}'::text[])) > 0
    or exists (
      select 1
      from public.reservation_items as item
      left join public.reservable_resources as resource
        on resource.id = item.resource_id
        and resource.service_id = v_service.id
      where item.booking_id = v_booking.id
        and (
          item.resource_label is not null
          or (
            item.resource_id is not null
            and (
              resource.id is null
              or resource.resource_kind <> 'capacity_bucket'
            )
          )
        )
    )
  then
    return jsonb_build_object('ok', false, 'error_code', 'unsupported_mode');
  end if;
  if p_date is null
    or p_start_time is null
    or p_end_time is null
    or p_quantity is null
    or p_quantity <= 0
    or p_end_time <= p_start_time
    or extract(epoch from (p_end_time - p_start_time)) / 60 <> v_service.duration_minutes
  then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_reservation');
  end if;
  if not public.platform_appointment_slot_is_allowed(
    p_venue_id, p_date, p_start_time, p_end_time, now()
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'outside_availability');
  end if;

  -- The service row lock serializes creation and rescheduling for this service.
  perform 1
  from public.bookings as existing
  where existing.service_id = v_service.id
    and existing.booking_date = p_date
    and existing.status in ('pending', 'confirmed')
    and existing.id <> v_booking.id
    and existing.start_time < p_end_time
    and existing.end_time > p_start_time
  for update;

  v_policy := coalesce(v_service.reservation_policy, '{}'::jsonb);
  v_capacity := case
    when jsonb_typeof(v_policy -> 'max_quantity') = 'number'
      then (v_policy ->> 'max_quantity')::integer
    else v_service.total_seats
  end;

  select coalesce(sum(existing.seats_booked), 0)
  into v_booked_quantity
  from public.bookings as existing
  where existing.service_id = v_service.id
    and existing.booking_date = p_date
    and existing.status in ('pending', 'confirmed')
    and existing.id <> v_booking.id
    and existing.start_time < p_end_time
    and existing.end_time > p_start_time;

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
  if p_quantity > v_available_quantity then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'not_enough_capacity',
      'available_quantity', v_available_quantity
    );
  end if;

  v_before := jsonb_build_object(
    'status', v_booking.status,
    'date', v_booking.booking_date,
    'start_time', v_booking.start_time,
    'end_time', v_booking.end_time,
    'quantity', v_booking.seats_booked
  );

  update public.bookings
  set booking_date = p_date,
      start_time = p_start_time,
      end_time = p_end_time,
      seats_booked = p_quantity,
      seat_labels = '{}'::text[],
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  delete from public.reservation_items where booking_id = v_booking.id;

  select resource.id
  into v_capacity_bucket_id
  from public.reservable_resources as resource
  where resource.service_id = v_service.id
    and resource.resource_kind = 'capacity_bucket'
    and resource.status = 'available'
  order by resource.sort_order, resource.label
  limit 1;

  insert into public.reservation_items (
    booking_id, service_id, resource_id, quantity, metadata
  ) values (
    v_booking.id,
    v_service.id,
    v_capacity_bucket_id,
    p_quantity,
    '{"created_by":"platform_staff_reschedule_capacity_reservation"}'::jsonb
  );

  insert into public.platform_audit_events (
    tenant_id, venue_id, actor_user_id, action, entity_type, entity_id,
    before_value, after_value, reason
  ) values (
    p_tenant_id,
    p_venue_id,
    p_actor_user_id,
    'reservation.capacity_rescheduled',
    'booking',
    v_booking.id::text,
    v_before,
    jsonb_build_object(
      'status', v_booking.status,
      'date', v_booking.booking_date,
      'start_time', v_booking.start_time,
      'end_time', v_booking.end_time,
      'quantity', v_booking.seats_booked
    ),
    trim(p_reason)
  );

  return jsonb_build_object('ok', true, 'booking', to_jsonb(v_booking));
exception
  when invalid_text_representation
    or invalid_datetime_format
    or datetime_field_overflow
    or not_null_violation
    or check_violation
  then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_reservation');
end;
$$;

revoke all on function public.platform_staff_reschedule_capacity_reservation(
  text, uuid, uuid, uuid, text, date, time, time, integer, text
) from public, anon, authenticated;
grant execute on function public.platform_staff_reschedule_capacity_reservation(
  text, uuid, uuid, uuid, text, date, time, time, integer, text
) to service_role;

-- Customer management links use a capacity-specific mutation when the
-- reservation has no practitioner. Quantity is preserved from the existing
-- reservation and the same service-first lock order protects against creates
-- and staff reschedules racing the customer request.

create or replace function public.reschedule_managed_capacity_reservation(
  p_public_slug text,
  p_token_hash text,
  p_date date,
  p_start_time time
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
  v_timezone text;
  v_minimum_notice_minutes integer;
  v_end_time time;
  v_venue_id uuid;
  v_tenant_id text;
  v_original_starts_at timestamptz;
  v_policy jsonb;
  v_policy_kind text;
  v_policy_max_quantity integer;
  v_capacity integer;
  v_booked_quantity integer;
  v_maintenance_quantity integer;
  v_available_quantity integer;
  v_resource_count integer;
  v_capacity_bucket_id uuid;
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

  select service.*
  into v_service
  from public.services as service
  join public.bookings as booking on booking.service_id = service.id
  where booking.id = v_token.booking_id
  for update of service;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'not_found'); end if;

  select booking.*
  into v_booking
  from public.bookings as booking
  where booking.id = v_token.booking_id
    and booking.service_id = v_service.id
  for update;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'not_found'); end if;
  if v_booking.status not in ('pending', 'confirmed') then
    return jsonb_build_object('ok', false, 'error_code', 'conflict', 'message', 'Reservation can no longer be rescheduled');
  end if;
  if v_booking.staff_id is not null
    or v_service.booking_mode = 'appointment'
    or v_service.selection_mode <> 'quantity'
    or cardinality(coalesce(v_booking.seat_labels, '{}'::text[])) > 0
    or exists (
      select 1
      from public.reservation_items as item
      left join public.reservable_resources as resource
        on resource.id = item.resource_id
        and resource.service_id = v_service.id
      where item.booking_id = v_booking.id
        and (
          item.resource_label is not null
          or (
            item.resource_id is not null
            and (
              resource.id is null
              or resource.resource_kind <> 'capacity_bucket'
            )
          )
        )
    )
  then
    return jsonb_build_object('ok', false, 'error_code', 'conflict', 'message', 'Reservation requires an assigned resource');
  end if;

  select venue.id, venue.tenant_id,
    coalesce(settings.timezone, 'UTC'), coalesce(settings.minimum_notice_minutes, 0)
  into v_venue_id, v_tenant_id, v_timezone, v_minimum_notice_minutes
  from public.venues as venue
  left join public.platform_availability_settings as settings on settings.venue_id = venue.id
  where venue.id = v_service.venue_id;

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
    return jsonb_build_object('ok', false, 'error_code', 'reschedule_closed');
  end if;

  perform 1
  from public.bookings as existing
  where existing.service_id = v_service.id
    and existing.booking_date = p_date
    and existing.status in ('pending', 'confirmed')
    and existing.id <> v_booking.id
    and existing.start_time < v_end_time
    and existing.end_time > p_start_time
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
    and existing.booking_date = p_date
    and existing.status in ('pending', 'confirmed')
    and existing.id <> v_booking.id
    and existing.start_time < v_end_time
    and existing.end_time > p_start_time;

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
  if v_booking.seats_booked > v_available_quantity then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'conflict',
      'available_quantity', v_available_quantity
    );
  end if;

  v_before := jsonb_build_object(
    'status', v_booking.status,
    'date', v_booking.booking_date,
    'start_time', v_booking.start_time,
    'end_time', v_booking.end_time,
    'quantity', v_booking.seats_booked
  );

  update public.bookings
  set booking_date = p_date,
      start_time = p_start_time,
      end_time = v_end_time,
      staff_id = null,
      seat_labels = '{}'::text[],
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  delete from public.reservation_items where booking_id = v_booking.id;

  select resource.id
  into v_capacity_bucket_id
  from public.reservable_resources as resource
  where resource.service_id = v_service.id
    and resource.resource_kind = 'capacity_bucket'
    and resource.status = 'available'
  order by resource.sort_order, resource.label
  limit 1;

  insert into public.reservation_items (
    booking_id, service_id, resource_id, quantity, metadata
  ) values (
    v_booking.id,
    v_service.id,
    v_capacity_bucket_id,
    v_booking.seats_booked,
    '{"created_by":"reschedule_managed_capacity_reservation"}'::jsonb
  );

  insert into public.platform_audit_events (
    tenant_id, venue_id, action, entity_type, entity_id,
    before_value, after_value, reason
  ) values (
    v_tenant_id,
    v_venue_id,
    'reservation.customer_rescheduled',
    'booking',
    v_booking.id::text,
    v_before,
    jsonb_build_object(
      'status', v_booking.status,
      'date', v_booking.booking_date,
      'start_time', v_booking.start_time,
      'end_time', v_booking.end_time,
      'quantity', v_booking.seats_booked
    ),
    'customer_management_link'
  );

  return jsonb_build_object('ok', true, 'booking', to_jsonb(v_booking));
exception
  when invalid_text_representation
    or invalid_datetime_format
    or datetime_field_overflow
    or not_null_violation
    or check_violation
  then
    return jsonb_build_object('ok', false, 'error_code', 'conflict');
end;
$$;

revoke all on function public.reschedule_managed_capacity_reservation(
  text, text, date, time
) from public, anon, authenticated;
grant execute on function public.reschedule_managed_capacity_reservation(
  text, text, date, time
) to service_role;
