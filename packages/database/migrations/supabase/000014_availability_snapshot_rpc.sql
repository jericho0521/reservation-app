-- Reservation platform database bundle artifact.
-- Source: supabase/create-reservation-atomic.sql
-- Section: public.read_reservation_availability_snapshot(uuid, date) RPC.

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
      'id', services.id,
      'name', services.name,
      'description', services.description,
      'total_seats', services.total_seats,
      'created_at', services.created_at,
      'resource_kind', services.resource_kind,
      'selection_mode', services.selection_mode,
      'reservation_policy', services.reservation_policy
    ),
    'bookings', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', bookings.id,
          'service_id', bookings.service_id,
          'user_name', bookings.user_name,
          'user_email', bookings.user_email,
          'user_phone', bookings.user_phone,
          'booking_date', bookings.booking_date,
          'start_time', bookings.start_time,
          'end_time', bookings.end_time,
          'seats_booked', bookings.seats_booked,
          'seat_labels', bookings.seat_labels,
          'status', bookings.status,
          'interface_type', bookings.interface_type
        ) order by bookings.start_time, bookings.id
      )
      from public.bookings
      where bookings.service_id = services.id
        and bookings.booking_date = p_date
        and bookings.status = 'confirmed'
    ), '[]'::jsonb),
    'maintenance', coalesce((
      select jsonb_agg(
        jsonb_build_object('seat_label', maintenance.seat_label)
        order by maintenance.seat_label
      )
      from public.service_seat_maintenance as maintenance
      where maintenance.service_id = services.id
        and maintenance.is_active = true
    ), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', resources.id,
          'service_id', resources.service_id,
          'label', resources.label,
          'kind', resources.resource_kind,
          'resource_kind', resources.resource_kind,
          'status', resources.status,
          'is_active', resources.status <> 'inactive',
          'capacity', resources.capacity,
          'metadata', resources.metadata
        ) order by resources.sort_order, resources.label, resources.id
      )
      from public.reservable_resources as resources
      where resources.service_id = services.id
    ), '[]'::jsonb),
    'layout', (
      select jsonb_build_object(
        'layout_kind', layouts.layout_kind,
        'metadata', layouts.metadata
      )
      from public.resource_layouts as layouts
      where layouts.service_id = services.id
        and layouts.is_active = true
    )
  )
  from public.services
  where services.id = p_service_id;
$$;

revoke all on function public.read_reservation_availability_snapshot(uuid, date) from public;
grant execute on function public.read_reservation_availability_snapshot(uuid, date) to service_role;
