-- Venue-scoped operational summaries and descriptive analytics RPCs.

alter table public.bookings add column if not exists cancellation_reason text;
alter table public.bookings add column if not exists cancelled_by text;
alter table public.bookings add column if not exists cancelled_at timestamptz;

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
  from public.venues
  left join public.platform_availability_settings settings
    on settings.tenant_id = venues.tenant_id and settings.venue_id = venues.id
  where venues.tenant_id = p_tenant_id and venues.id = p_venue_id;
  if not found then raise exception 'Venue not found.' using errcode = 'P0002'; end if;

  with venue_services as (
    select services.id, services.name from public.services
    where services.venue_id = p_venue_id
  ), scoped_conversations as (
    select conversations.* from public.platform_conversations conversations
    where conversations.tenant_id = p_tenant_id and conversations.venue_id = p_venue_id
      and (conversations.created_at at time zone v_timezone)::date between p_from_date and p_to_date
      and (p_include_simulation or conversations.channel <> 'simulation')
  ), scoped_messages as (
    select messages.* from public.platform_conversation_messages messages
    join scoped_conversations conversations on conversations.id = messages.conversation_id
  ), scoped_bookings as (
    select bookings.*, venue_services.name as service_name,
      coalesce(conversation.channel, case when bookings.interface_type = 'chat' then 'web_chat' else 'web_booking' end) as channel
    from public.bookings
    join venue_services on venue_services.id = bookings.service_id
    left join lateral (
      select conversations.channel from public.platform_conversations conversations
      where conversations.reservation_id = bookings.id and conversations.tenant_id = p_tenant_id and conversations.venue_id = p_venue_id
      order by conversations.updated_at desc limit 1
    ) conversation on true
    where bookings.booking_date between p_from_date and p_to_date
      and (p_include_simulation or coalesce(conversation.channel, '') <> 'simulation')
  ), reservation_totals as (
    select count(*)::integer as total,
      count(*) filter (where status = 'cancelled')::integer as cancelled
    from scoped_bookings
  ), funnel as (
    select
      (select count(*)::integer from scoped_conversations) as conversations_started,
      count(distinct conversation_id) filter (where metadata->>'event' = 'booking.proposed')::integer as proposal_shown,
      count(distinct conversation_id) filter (where metadata->>'event' = 'booking.confirmation_requested')::integer as confirmation_requested,
      count(distinct conversation_id) filter (where metadata->>'event' = 'booking.confirmed')::integer as reservations_created
    from scoped_messages
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
      select status, count(*)::integer as count from scoped_bookings group by status
    ) row), '[]'::jsonb),
    'reservations_by_channel', coalesce((select jsonb_agg(row order by channel) from (
      select channel, count(*)::integer as count from scoped_bookings group by channel
    ) row), '[]'::jsonb),
    'channel_performance', coalesce((select jsonb_agg(row order by channel) from (
      select conversations.channel,
        count(distinct conversations.id)::integer as conversations_started,
        count(distinct messages.conversation_id) filter (where messages.metadata->>'event' = 'booking.proposed')::integer as proposal_shown,
        count(distinct messages.conversation_id) filter (where messages.metadata->>'event' = 'booking.confirmation_requested')::integer as confirmation_requested,
        count(distinct messages.conversation_id) filter (where messages.metadata->>'event' = 'booking.confirmed')::integer as reservations_created,
        case when count(distinct conversations.id) = 0 then 0 else round(count(distinct messages.conversation_id) filter (where messages.metadata->>'event' = 'booking.confirmed')::numeric / count(distinct conversations.id), 4) end as conversion_rate
      from scoped_conversations conversations
      left join scoped_messages messages on messages.conversation_id = conversations.id
      group by conversations.channel
    ) row), '[]'::jsonb),
    'reservations_by_service', coalesce((select jsonb_agg(row order by count desc, service_name) from (
      select service_id, service_name, count(*)::integer as count from scoped_bookings group by service_id, service_name order by count(*) desc, service_name limit 20
    ) row), '[]'::jsonb),
    'popular_slots', coalesce((select jsonb_agg(row order by count desc, day_of_week, start_time) from (
      select extract(isodow from booking_date)::integer as day_of_week, start_time::text, count(*)::integer as count
      from scoped_bookings where status <> 'cancelled' group by extract(isodow from booking_date), start_time order by count(*) desc, start_time limit 20
    ) row), '[]'::jsonb),
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

revoke all on function public.read_platform_analytics(text, uuid, date, date, boolean) from public, anon, authenticated;
grant execute on function public.read_platform_analytics(text, uuid, date, date, boolean) to service_role;
