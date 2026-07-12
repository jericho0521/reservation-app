-- Venue-scoped operational summaries and descriptive analytics RPCs.

create or replace function public.read_platform_operations_overview(
  p_tenant_id text,
  p_venue_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with scope as (
    select venues.id as venue_id,
      coalesce(settings.timezone, 'UTC') as timezone,
      (p_now at time zone coalesce(settings.timezone, 'UTC'))::date as local_date
    from public.venues
    left join public.platform_availability_settings settings
      on settings.tenant_id = venues.tenant_id and settings.venue_id = venues.id
    where venues.tenant_id = p_tenant_id and venues.id = p_venue_id
  ), venue_services as (
    select services.id, services.name
    from public.services
    join scope on scope.venue_id = services.venue_id
  ), today_bookings as (
    select bookings.*, venue_services.name as service_name,
      coalesce(conversation.channel, case when bookings.interface_type = 'chat' then 'web_chat' else 'web_booking' end) as channel
    from public.bookings
    join venue_services on venue_services.id = bookings.service_id
    join scope on bookings.booking_date = scope.local_date
    left join lateral (
      select platform_conversations.channel
      from public.platform_conversations
      where platform_conversations.reservation_id = bookings.id
        and platform_conversations.tenant_id = p_tenant_id
        and platform_conversations.venue_id = p_venue_id
      order by platform_conversations.updated_at desc
      limit 1
    ) conversation on true
  ), resource_counts as (
    select count(*)::integer as total,
      count(*) filter (where resources.status = 'available' and not exists (
        select 1 from public.service_seat_maintenance maintenance
        where maintenance.service_id = resources.service_id
          and maintenance.seat_label = resources.label
          and maintenance.is_active = true
      ))::integer as available,
      count(*) filter (where resources.status = 'maintenance' or exists (
        select 1 from public.service_seat_maintenance maintenance
        where maintenance.service_id = resources.service_id
          and maintenance.seat_label = resources.label
          and maintenance.is_active = true
      ))::integer as maintenance
    from public.reservable_resources resources
    join venue_services on venue_services.id = resources.service_id
  ), conversation_counts as (
    select count(*) filter (where status = 'active')::integer as open,
      count(*) filter (where status = 'active' and automation_state = 'manual')::integer as staff_takeover
    from public.platform_conversations
    where tenant_id = p_tenant_id and venue_id = p_venue_id
  )
  select jsonb_build_object(
    'generated_at', p_now,
    'timezone', scope.timezone,
    'local_date', scope.local_date,
    'reservations', jsonb_build_object(
      'today', (select count(*)::integer from today_bookings),
      'pending', (select count(*) filter (where status = 'pending')::integer from today_bookings),
      'confirmed', (select count(*) filter (where status = 'confirmed')::integer from today_bookings),
      'completed', (select count(*) filter (where status = 'completed')::integer from today_bookings),
      'cancelled', (select count(*) filter (where status = 'cancelled')::integer from today_bookings),
      'timeline', coalesce((
        select jsonb_agg(jsonb_build_object(
          'reservation_id', id,
          'service_name', service_name,
          'customer_name', user_name,
          'start_time', start_time,
          'end_time', end_time,
          'quantity', seats_booked,
          'status', status,
          'channel', channel
        ) order by start_time, id)
        from (select * from today_bookings order by start_time, id limit 20) bounded
      ), '[]'::jsonb)
    ),
    'resources', (select jsonb_build_object('total', total, 'available', available, 'maintenance', maintenance) from resource_counts),
    'conversations', (select jsonb_build_object('open', open, 'staff_takeover', staff_takeover) from conversation_counts)
  )
  from scope;
$$;

revoke all on function public.read_platform_operations_overview(text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.read_platform_operations_overview(text, uuid, timestamptz) to service_role;
