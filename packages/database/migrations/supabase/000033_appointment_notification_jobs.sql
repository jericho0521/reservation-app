-- Atomically create email notification intents with appointment mutations.

create or replace function public.platform_enqueue_appointment_notification_jobs()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tenant_id text;
  v_venue_id uuid;
  v_timezone text;
  v_event_kind text;
  v_recipient text := lower(trim(new.user_email));
  v_starts_at timestamptz;
  v_reminder_at timestamptz;
  v_occurrence_key text;
begin
  select venue.tenant_id, venue.id, coalesce(settings.timezone, 'UTC')
  into v_tenant_id, v_venue_id, v_timezone
  from public.services as service
  join public.venues as venue on venue.id = service.venue_id
  left join public.platform_availability_settings as settings on settings.venue_id = venue.id
  where service.id = new.service_id and service.booking_mode = 'appointment';

  if not found or v_recipient = '' then return new; end if;

  if tg_op = 'INSERT' and new.status in ('pending', 'confirmed') then
    v_event_kind := 'appointment_confirmed';
  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' then
    v_event_kind := 'appointment_cancelled';
  elsif tg_op = 'UPDATE' and new.status in ('pending', 'confirmed') and (
    new.booking_date is distinct from old.booking_date
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time
    or new.staff_id is distinct from old.staff_id
  ) then
    v_event_kind := 'appointment_rescheduled';
  elsif tg_op = 'UPDATE' and new.status = 'confirmed' and old.status = 'pending' then
    v_event_kind := 'appointment_confirmed';
  else
    return new;
  end if;

  if tg_op = 'UPDATE' then
    update public.platform_jobs as reminder
    set status = 'failed', lease_owner = null, leased_until = null,
        error_code = 'superseded', completed_at = null, failed_at = now()
    where reminder.tenant_id = v_tenant_id
      and reminder.kind = 'notification.email'
      and reminder.payload ->> 'kind' = 'appointment_reminder'
      and reminder.payload ->> 'reservationId' = new.id::text
      and reminder.status in ('pending', 'leased');
  end if;

  v_starts_at := (new.booking_date + new.start_time) at time zone v_timezone;
  v_occurrence_key := to_char(v_starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  insert into public.platform_jobs (
    tenant_id, venue_id, kind, payload, max_attempts, available_at, idempotency_key
  ) values (
    v_tenant_id, v_venue_id, 'notification.email',
    jsonb_build_object(
      'kind', v_event_kind, 'reservationId', new.id::text,
      'recipient', v_recipient, 'locale', 'en', 'expectedAppointmentStart', v_occurrence_key,
      'expectedAppointmentDate', new.booking_date::text, 'expectedAppointmentTime', new.start_time::text
    ),
    5, now(),
    'booking:' || new.id::text || ':' || replace(v_event_kind, 'appointment_', '')
      || case when v_event_kind = 'appointment_rescheduled' then ':' || v_occurrence_key else '' end
  ) on conflict (tenant_id, idempotency_key) do nothing;

  if new.status in ('pending', 'confirmed') then
    v_reminder_at := v_starts_at - interval '24 hours';
    if v_reminder_at > now() then
      insert into public.platform_jobs (
        tenant_id, venue_id, kind, payload, max_attempts, available_at, idempotency_key
      ) values (
        v_tenant_id, v_venue_id, 'notification.email',
        jsonb_build_object(
          'kind', 'appointment_reminder', 'reservationId', new.id::text,
          'recipient', v_recipient, 'locale', 'en', 'expectedAppointmentStart', v_occurrence_key,
          'expectedAppointmentDate', new.booking_date::text, 'expectedAppointmentTime', new.start_time::text
        ),
        5, v_reminder_at, 'booking:' || new.id::text || ':reminder:' || v_occurrence_key
      ) on conflict (tenant_id, idempotency_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists platform_bookings_enqueue_notification_jobs on public.bookings;
create trigger platform_bookings_enqueue_notification_jobs
after insert or update of status, booking_date, start_time, end_time, staff_id
on public.bookings
for each row execute function public.platform_enqueue_appointment_notification_jobs();

create or replace function public.platform_record_notification_attempt(
  p_tenant_id text, p_booking_id uuid, p_notification_kind text
)
returns void language sql security definer set search_path = public as $$
  insert into public.platform_notification_deliveries (
    tenant_id, booking_id, notification_kind, attempts
  ) values (p_tenant_id, p_booking_id, p_notification_kind, 1)
  on conflict (booking_id, notification_kind) do update
  set attempts = platform_notification_deliveries.attempts + 1,
      next_attempt_at = null,
      final_failure_code = null;
$$;

create or replace function public.platform_record_notification_delivered(
  p_tenant_id text, p_booking_id uuid, p_notification_kind text, p_provider_message_id text
)
returns void language sql security definer set search_path = public as $$
  update public.platform_notification_deliveries
  set provider_message_id = left(nullif(p_provider_message_id, ''), 255),
      delivered_at = now(), next_attempt_at = null, final_failure_code = null
  where tenant_id = p_tenant_id and booking_id = p_booking_id
    and notification_kind = p_notification_kind;
$$;

create or replace function public.platform_record_notification_retry(
  p_tenant_id text, p_booking_id uuid, p_notification_kind text,
  p_next_attempt_at timestamptz, p_error_code text, p_final boolean
)
returns void language sql security definer set search_path = public as $$
  update public.platform_notification_deliveries
  set next_attempt_at = case when p_final then null else p_next_attempt_at end,
      final_failure_code = case when p_final then p_error_code else null end
  where tenant_id = p_tenant_id and booking_id = p_booking_id
    and notification_kind = p_notification_kind;
$$;

revoke all on function public.platform_record_notification_attempt(text, uuid, text) from public, anon, authenticated;
revoke all on function public.platform_record_notification_delivered(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.platform_record_notification_retry(text, uuid, text, timestamptz, text, boolean) from public, anon, authenticated;
grant execute on function public.platform_record_notification_attempt(text, uuid, text) to service_role;
grant execute on function public.platform_record_notification_delivered(text, uuid, text, text) to service_role;
grant execute on function public.platform_record_notification_retry(text, uuid, text, timestamptz, text, boolean) to service_role;
