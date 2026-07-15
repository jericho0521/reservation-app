-- Expose the owning venue so service-role callers can enforce installation scope.
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
      'venue_id', services.venue_id,
      'name', services.name,
      'description', services.description,
      'total_seats', services.total_seats,
      'created_at', services.created_at,
      'resource_kind', services.resource_kind,
      'selection_mode', services.selection_mode,
      'reservation_policy', services.reservation_policy,
      'metadata', services.metadata
    ),
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(bookings) order by bookings.start_time, bookings.id)
      from public.bookings
      where bookings.service_id = services.id
        and bookings.booking_date = p_date
        and bookings.status = 'confirmed'
    ), '[]'::jsonb),
    'maintenance', coalesce((
      select jsonb_agg(jsonb_build_object('seat_label', maintenance.seat_label) order by maintenance.seat_label)
      from public.service_seat_maintenance maintenance
      where maintenance.service_id = services.id and maintenance.is_active = true
    ), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', resources.id,
        'service_id', resources.service_id,
        'label', resources.label,
        'kind', resources.resource_kind,
        'resource_kind', resources.resource_kind,
        'status', resources.status,
        'is_active', resources.status <> 'inactive',
        'capacity', resources.capacity,
        'metadata', resources.metadata
      ) order by resources.sort_order, resources.label, resources.id)
      from public.reservable_resources resources
      where resources.service_id = services.id
    ), '[]'::jsonb),
    'layout', (
      select jsonb_build_object('layout_kind', layouts.layout_kind, 'metadata', layouts.metadata)
      from public.resource_layouts layouts
      where layouts.service_id = services.id and layouts.is_active = true
    ),
    'operating_hours', (
      select public.read_experience_operating_hours(venues.tenant_id, venues.id)
      from public.venues
      where venues.id = services.venue_id
    )
  )
  from public.services
  where services.id = p_service_id;
$$;

revoke all on function public.read_reservation_availability_snapshot(uuid, date) from public, anon, authenticated;
grant execute on function public.read_reservation_availability_snapshot(uuid, date) to service_role;
