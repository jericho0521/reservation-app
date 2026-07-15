-- Bounded appointment analytics for practitioner utilization, locations, and no-shows.

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
        when booking.channel in ('web_chat', 'whatsapp', 'simulation') then booking.channel
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

revoke all on function public.read_platform_analytics(text, uuid, date, date, boolean) from public, anon, authenticated;
grant execute on function public.read_platform_analytics(text, uuid, date, date, boolean) to service_role;
