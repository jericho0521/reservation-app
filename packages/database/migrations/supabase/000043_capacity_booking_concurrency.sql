-- Close resource-booking concurrency gaps without rewriting migrations that
-- may already have been applied. Non-appointment bookings serialize on the
-- service, so validate labeled allocations across every overlapping booking
-- while holding that same lock. Staff-created reservations acquire the service
-- write lock before entering the atomic RPC.

alter function public.create_reservation_atomic_legacy_without_channel(jsonb)
rename to create_reservation_atomic_legacy_without_overlapping_resource_conflicts;

create or replace function public.create_reservation_atomic_legacy_without_channel(payload jsonb)
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
  v_service public.services%rowtype;
  v_resource_conflicts text[];
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    return public.create_reservation_atomic_legacy_without_overlapping_resource_conflicts(payload);
  end if;

  begin
    v_service_id := nullif(payload ->> 'service_id', '')::uuid;
    v_booking_date := nullif(payload ->> 'booking_date', '')::date;
    v_start_time := nullif(payload ->> 'start_time', '')::time;
    v_end_time := nullif(payload ->> 'end_time', '')::time;
  exception
    when invalid_text_representation
      or invalid_datetime_format
      or datetime_field_overflow
    then
      return public.create_reservation_atomic_legacy_without_overlapping_resource_conflicts(payload);
  end;

  if v_service_id is null
    or v_booking_date is null
    or v_start_time is null
    or v_end_time is null
    or v_end_time <= v_start_time
  then
    return public.create_reservation_atomic_legacy_without_overlapping_resource_conflicts(payload);
  end if;

  select service.*
  into v_service
  from public.services as service
  where service.id = v_service_id
  for update of service;

  if not found then
    return public.create_reservation_atomic_legacy_without_overlapping_resource_conflicts(payload);
  end if;

  -- This row lock complements the service lock for transactions that update an
  -- existing booking. New resource bookings are serialized by the service lock.
  perform 1
  from public.bookings as existing
  where existing.service_id = v_service.id
    and existing.booking_date = v_booking_date
    and existing.status in ('pending', 'confirmed')
    and existing.start_time < v_end_time
    and existing.end_time > v_start_time
  for update;

  drop table if exists pg_temp.capacity_overlap_request_items;
  create temp table capacity_overlap_request_items (
    resource_label text,
    quantity integer
  ) on commit drop;

  if jsonb_typeof(payload -> 'reservation_items') = 'array' then
    insert into pg_temp.capacity_overlap_request_items (resource_label, quantity)
    select
      coalesce(
        nullif(trim(item ->> 'resource_label'), ''),
        requested_resource.label
      ),
      case
        when jsonb_typeof(item -> 'quantity') = 'number'
          then (item ->> 'quantity')::integer
        else null
      end
    from jsonb_array_elements(payload -> 'reservation_items') as item
    left join public.reservable_resources as requested_resource
      on requested_resource.service_id = v_service.id
      and requested_resource.id::text = nullif(item ->> 'resource_id', '');
  elsif jsonb_typeof(payload -> 'seat_labels') = 'array' then
    insert into pg_temp.capacity_overlap_request_items (resource_label, quantity)
    select coalesce(requested_resource.label, nullif(trim(requested.value), '')), 1
    from jsonb_array_elements_text(payload -> 'seat_labels') as requested(value)
    left join public.reservable_resources as requested_resource
      on requested_resource.service_id = v_service.id
      and requested_resource.id::text = requested.value;
  end if;

  select coalesce(array_agg(conflict.label order by conflict.label), '{}'::text[])
  into v_resource_conflicts
  from (
    select requested.label
    from (
      select
        lower(request.resource_label) as normalized_label,
        min(request.resource_label) as label,
        sum(request.quantity) as requested_quantity
      from pg_temp.capacity_overlap_request_items as request
      where request.resource_label is not null
        and request.quantity > 0
      group by lower(request.resource_label)
    ) as requested
    join public.reservable_resources as resource
      on resource.service_id = v_service.id
      and lower(resource.label) = requested.normalized_label
    left join (
      select lower(allocation.label) as normalized_label, sum(allocation.quantity) as quantity
      from (
        select
          resolved.label,
          item.quantity
        from public.bookings as booking
        join public.reservation_items as item
          on item.booking_id = booking.id
        left join public.reservable_resources as allocated_resource
          on allocated_resource.id = item.resource_id
        cross join lateral (
          values (coalesce(
            item.resource_label,
            case
              when allocated_resource.resource_kind <> 'capacity_bucket'
                then allocated_resource.label
            end
          ))
        ) as resolved(label)
        where booking.service_id = v_service.id
          and booking.booking_date = v_booking_date
          and booking.status in ('pending', 'confirmed')
          and booking.start_time < v_end_time
          and booking.end_time > v_start_time
          and resolved.label is not null

        union all

        select label.label, 1
        from public.bookings as booking
        cross join lateral unnest(coalesce(booking.seat_labels, '{}'::text[])) as label(label)
        where booking.service_id = v_service.id
          and booking.booking_date = v_booking_date
          and booking.status in ('pending', 'confirmed')
          and booking.start_time < v_end_time
          and booking.end_time > v_start_time
          and not exists (
            select 1
            from public.reservation_items as item
            where item.booking_id = booking.id
          )
      ) as allocation
      group by lower(allocation.label)
    ) as existing
      on existing.normalized_label = requested.normalized_label
    where case
      when v_service.selection_mode = 'quantity'
        and resource.resource_kind <> 'room'
        then requested.requested_quantity + coalesce(existing.quantity, 0) > resource.capacity
      else coalesce(existing.quantity, 0) > 0
    end
  ) as conflict;

  v_resource_conflicts := coalesce(v_resource_conflicts, '{}'::text[]);
  if cardinality(v_resource_conflicts) > 0 then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'resource_conflict',
      'message', 'Some selected resources are already booked',
      'conflicting_resource_labels', to_jsonb(v_resource_conflicts)
    );
  end if;

  return public.create_reservation_atomic_legacy_without_overlapping_resource_conflicts(payload);
end;
$$;

revoke all on function public.create_reservation_atomic_legacy_without_overlapping_resource_conflicts(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.create_reservation_atomic_legacy_without_channel(jsonb)
  from public, anon, authenticated, service_role;

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

  -- create_reservation_atomic_legacy_without_channel also takes this lock for
  -- resource services. Taking the strongest required lock here avoids a
  -- concurrent FOR SHARE -> FOR UPDATE lock-upgrade deadlock.
  perform 1
  from public.services as service
  join public.venues as venue on venue.id = service.venue_id
  where service.id = nullif(p_payload ->> 'service_id', '')::uuid
    and service.venue_id = p_venue_id
    and venue.tenant_id = p_tenant_id
  for update of service;
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

revoke all on function public.platform_staff_create_appointment(text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.platform_staff_create_appointment(text, uuid, uuid, jsonb)
  to service_role;
