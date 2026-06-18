-- Reservation platform database bundle artifact.
-- Source: supabase/create-reservation-atomic.sql
-- Section: canonical public.create_reservation_atomic(payload jsonb) RPC.

create or replace function public.create_reservation_atomic(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p_service_id uuid;
  p_user_name text;
  p_user_email text;
  p_user_phone text;
  p_booking_date date;
  p_start_time time;
  p_end_time time;
  p_seats_booked integer;
  p_seat_labels text[];
  p_interface_type text;
  v_service public.services%rowtype;
  v_policy jsonb;
  v_policy_kind text;
  v_policy_max_quantity integer;
  v_requires_resource_labels boolean;
  v_resource_count integer;
  v_capacity integer;
  v_booked_quantity integer;
  v_maintenance_quantity integer;
  v_available_quantity integer;
  v_maintenance_conflicts text[];
  v_resource_conflicts text[];
  v_invalid_resource_labels text[];
  v_requested_total_quantity integer;
  v_requested_labeled_quantity integer;
  v_requested_unlabeled_quantity integer;
  v_booking public.bookings%rowtype;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_reservation',
      'message', 'Reservation payload must be a JSON object'
    );
  end if;

  p_service_id := (payload ->> 'service_id')::uuid;
  p_user_name := nullif(trim(coalesce(payload ->> 'user_name', '')), '');
  p_user_email := nullif(trim(coalesce(payload ->> 'user_email', '')), '');
  p_user_phone := nullif(trim(coalesce(payload ->> 'user_phone', '')), '');
  p_booking_date := (payload ->> 'booking_date')::date;
  p_start_time := (payload ->> 'start_time')::time;
  p_end_time := (payload ->> 'end_time')::time;
  p_seats_booked := (payload ->> 'seats_booked')::integer;
  p_interface_type := coalesce(payload ->> 'interface_type', 'form');

  if p_service_id is null
    or p_user_name is null
    or p_user_email is null
    or p_booking_date is null
    or p_start_time is null
    or p_end_time is null
    or p_seats_booked is null
    or p_seats_booked <= 0
    or p_interface_type not in ('form', 'chat')
  then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_reservation',
      'message', 'Reservation payload is missing required fields'
    );
  end if;

  drop table if exists pg_temp.create_reservation_atomic_request_items;
  create temp table create_reservation_atomic_request_items (
    resource_label text,
    quantity integer
  ) on commit drop;

  if jsonb_typeof(payload -> 'reservation_items') = 'array' then
    insert into pg_temp.create_reservation_atomic_request_items (
      resource_label,
      quantity
    )
    select
      nullif(trim(item ->> 'resource_label'), ''),
      case
        when jsonb_typeof(item -> 'quantity') = 'number'
          then (item ->> 'quantity')::integer
        else null
      end
    from jsonb_array_elements(payload -> 'reservation_items') as item;
  elsif jsonb_typeof(payload -> 'seat_labels') = 'array' then
    insert into pg_temp.create_reservation_atomic_request_items (
      resource_label,
      quantity
    )
    select
      nullif(trim(jsonb_array_elements_text(payload -> 'seat_labels')), ''),
      1;
  else
    insert into pg_temp.create_reservation_atomic_request_items (
      resource_label,
      quantity
    )
    values (null, p_seats_booked);
  end if;

  if exists (
    select 1
    from pg_temp.create_reservation_atomic_request_items
    where quantity is null
      or quantity <= 0
  ) then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_reservation',
      'message', 'Reservation items must include positive quantities'
    );
  end if;

  select
    coalesce(sum(quantity), 0),
    coalesce(sum(quantity) filter (where resource_label is not null), 0),
    coalesce(sum(quantity) filter (where resource_label is null), 0)
  into
    v_requested_total_quantity,
    v_requested_labeled_quantity,
    v_requested_unlabeled_quantity
  from pg_temp.create_reservation_atomic_request_items;

  if v_requested_total_quantity <> p_seats_booked then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_reservation',
      'message', 'Reservation item quantities must match booked quantity'
    );
  end if;

  select coalesce(array_agg(distinct resource_label order by resource_label), '{}'::text[])
  into p_seat_labels
  from pg_temp.create_reservation_atomic_request_items
  where resource_label is not null;

  p_seat_labels := coalesce(p_seat_labels, '{}'::text[]);

  select *
  into v_service
  from public.services
  where id = p_service_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_service',
      'message', 'Service not found'
    );
  end if;

  perform 1
  from public.bookings
  where service_id = p_service_id
    and booking_date = p_booking_date
    and start_time = p_start_time
    and status = 'confirmed'
  for update;

  v_policy := coalesce(v_service.reservation_policy, '{}'::jsonb);
  v_policy_kind := coalesce(v_policy ->> 'kind',
    case
      when v_service.selection_mode = 'assigned_resource' then 'assigned_resource'
      when v_service.selection_mode = 'hybrid' then 'hybrid'
      else 'capacity'
    end
  );
  v_policy_max_quantity := case
    when jsonb_typeof(v_policy -> 'max_quantity') = 'number'
      then (v_policy ->> 'max_quantity')::integer
    else v_service.total_seats
  end;
  v_requires_resource_labels :=
    v_service.selection_mode = 'assigned_resource'
    or coalesce((v_policy ->> 'require_resource_labels')::boolean, false);

  select count(*)
  into v_resource_count
  from public.reservable_resources
  where service_id = p_service_id;

  select coalesce(array_agg(requested.label order by requested.label), '{}'::text[])
  into v_invalid_resource_labels
  from (
    select distinct resource_label as label
    from pg_temp.create_reservation_atomic_request_items
    where resource_label is not null
  ) as requested
  left join public.reservable_resources as resources
    on resources.service_id = p_service_id
    and lower(resources.label) = lower(requested.label)
    and resources.status <> 'inactive'
  where resources.id is null;

  v_invalid_resource_labels := coalesce(v_invalid_resource_labels, '{}'::text[]);

  if cardinality(v_invalid_resource_labels) > 0 then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_resource_labels',
      'message', 'Selected resource labels are not valid for this service',
      'conflicting_resource_labels', to_jsonb(v_invalid_resource_labels)
    );
  end if;

  if v_requires_resource_labels and v_requested_labeled_quantity <> p_seats_booked then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'missing_resource_labels',
      'message', 'Selected resource labels must match booked quantity'
    );
  end if;

  select coalesce(array_agg(requested.label order by requested.label), '{}'::text[])
  into v_maintenance_conflicts
  from (
    select distinct resource_label as label
    from pg_temp.create_reservation_atomic_request_items
    where resource_label is not null
  ) as requested
  where exists (
    select 1
    from public.service_seat_maintenance as maintenance
    where maintenance.service_id = p_service_id
      and maintenance.is_active = true
      and lower(maintenance.seat_label) = lower(requested.label)
  )
  or exists (
    select 1
    from public.reservable_resources as resources
    where resources.service_id = p_service_id
      and resources.status = 'maintenance'
      and lower(resources.label) = lower(requested.label)
  );

  v_maintenance_conflicts := coalesce(v_maintenance_conflicts, '{}'::text[]);

  if cardinality(v_maintenance_conflicts) > 0 then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'maintenance_conflict',
      'message', 'Some selected resources are under maintenance',
      'conflicting_resource_labels', to_jsonb(v_maintenance_conflicts)
    );
  end if;

  select coalesce(array_agg(requested.label order by requested.label), '{}'::text[])
  into v_resource_conflicts
  from (
    select
      resource_label as label,
      sum(quantity) as requested_quantity
    from pg_temp.create_reservation_atomic_request_items
    where resource_label is not null
    group by resource_label
  ) as requested
  join public.reservable_resources as resources
    on resources.service_id = p_service_id
    and lower(resources.label) = lower(requested.label)
  left join (
    select
      lower(existing.label) as normalized_label,
      sum(existing.quantity) as quantity
    from (
      select
        items.resource_label as label,
        items.quantity
      from public.bookings as bookings
      join public.reservation_items as items
        on items.booking_id = bookings.id
      where bookings.service_id = p_service_id
        and bookings.booking_date = p_booking_date
        and bookings.start_time = p_start_time
        and bookings.status = 'confirmed'
        and items.resource_label is not null
      union all
      select
        labels.label,
        1
      from public.bookings as bookings
      cross join lateral unnest(coalesce(bookings.seat_labels, '{}'::text[])) as labels(label)
      where bookings.service_id = p_service_id
        and bookings.booking_date = p_booking_date
        and bookings.start_time = p_start_time
        and bookings.status = 'confirmed'
        and not exists (
          select 1
          from public.reservation_items as items
          where items.booking_id = bookings.id
        )
    ) as existing
    group by lower(existing.label)
  ) as existing
    on existing.normalized_label = lower(requested.label)
  where requested.requested_quantity + coalesce(existing.quantity, 0) > resources.capacity;

  v_resource_conflicts := coalesce(v_resource_conflicts, '{}'::text[]);

  if cardinality(v_resource_conflicts) > 0 then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'resource_conflict',
      'message', 'Some selected resources are already booked',
      'conflicting_resource_labels', to_jsonb(v_resource_conflicts)
    );
  end if;

  if v_policy_kind = 'capacity' then
    v_capacity := coalesce(v_policy_max_quantity, v_service.total_seats);
  else
    select coalesce(sum(resources.capacity), 0)
    into v_capacity
    from public.reservable_resources as resources
    where resources.service_id = p_service_id
      and resources.status <> 'inactive';

    if v_capacity <= 0 then
      v_capacity := coalesce(v_policy_max_quantity, v_service.total_seats);
    end if;
  end if;

  select coalesce(sum(bookings.seats_booked), 0)
  into v_booked_quantity
  from public.bookings as bookings
  where bookings.service_id = p_service_id
    and bookings.booking_date = p_booking_date
    and bookings.start_time = p_start_time
    and bookings.status = 'confirmed';

  if v_resource_count > 0 then
    select coalesce(sum(resources.capacity), 0)
    into v_maintenance_quantity
    from public.reservable_resources as resources
    where resources.service_id = p_service_id
      and resources.status <> 'inactive'
      and (
        resources.status = 'maintenance'
        or exists (
          select 1
          from public.service_seat_maintenance as maintenance
          where maintenance.service_id = p_service_id
            and maintenance.is_active = true
            and lower(maintenance.seat_label) = lower(resources.label)
        )
      );
  else
    select count(distinct lower(maintenance.seat_label))
    into v_maintenance_quantity
    from public.service_seat_maintenance as maintenance
    where maintenance.service_id = p_service_id
      and maintenance.is_active = true;
  end if;

  v_available_quantity := greatest(
    0,
    v_capacity - v_booked_quantity - coalesce(v_maintenance_quantity, 0)
  );

  if p_seats_booked > v_available_quantity then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'not_enough_capacity',
      'message', 'Not enough capacity is available',
      'available_quantity', v_available_quantity
    );
  end if;

  insert into public.bookings (
    service_id,
    user_name,
    user_email,
    user_phone,
    booking_date,
    start_time,
    end_time,
    seats_booked,
    seat_labels,
    status,
    interface_type
  )
  values (
    p_service_id,
    p_user_name,
    p_user_email,
    p_user_phone,
    p_booking_date,
    p_start_time,
    p_end_time,
    p_seats_booked,
    p_seat_labels,
    'confirmed',
    p_interface_type
  )
  returning * into v_booking;

  if cardinality(p_seat_labels) > 0 then
    insert into public.reservation_items (
      booking_id,
      service_id,
      resource_id,
      resource_label,
      quantity,
      metadata
    )
    select
      v_booking.id,
      p_service_id,
      resources.id,
      requested.resource_label,
      requested.quantity,
      '{"created_by":"create_reservation_atomic"}'::jsonb
    from (
      select
        resource_label,
        sum(quantity) as quantity
      from pg_temp.create_reservation_atomic_request_items
      where resource_label is not null
      group by resource_label
    ) as requested
    left join public.reservable_resources as resources
      on resources.service_id = p_service_id
      and lower(resources.label) = lower(requested.resource_label);
  end if;

  if v_requested_unlabeled_quantity > 0 then
    insert into public.reservation_items (
      booking_id,
      service_id,
      resource_id,
      quantity,
      metadata
    )
    select
      v_booking.id,
      p_service_id,
      resources.id,
      v_requested_unlabeled_quantity,
      '{"created_by":"create_reservation_atomic"}'::jsonb
    from (
      select id
      from public.reservable_resources
      where service_id = p_service_id
        and resource_kind = 'capacity_bucket'
        and status = 'available'
      order by sort_order, label
      limit 1
    ) as resources;

    if not found then
      insert into public.reservation_items (
        booking_id,
        service_id,
        quantity,
        metadata
      )
      values (
        v_booking.id,
        p_service_id,
        v_requested_unlabeled_quantity,
        '{"created_by":"create_reservation_atomic"}'::jsonb
      );
    end if;
  end if;

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
    return jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_reservation',
      'message', 'Reservation payload contains invalid field values'
    );
end;
$$;

revoke all on function public.create_reservation_atomic(jsonb) from public;
grant execute on function public.create_reservation_atomic(jsonb) to service_role;
