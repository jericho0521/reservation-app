begin;

-- All public creation goes through the validated, rate-limited server endpoints.
drop policy if exists "Public can create bookings" on public.bookings;
revoke insert on public.bookings from anon, authenticated;

create or replace function public.enforce_booking_integrity()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  capacity integer; blocked integer; used integer; slot integer;
  start_hour integer; end_hour integer; first_date date;
  local_now timestamp := clock_timestamp() at time zone 'Asia/Kuala_Lumpur';
  starts_at timestamp; schedule_changed boolean := true;
begin
  -- A service-level lock also coordinates reservations with maintenance changes.
  if TG_OP = 'UPDATE' and old.service_id <> new.service_id then
    perform pg_advisory_xact_lock(hashtextextended(least(old.service_id::text, new.service_id::text), 0));
    perform pg_advisory_xact_lock(hashtextextended(greatest(old.service_id::text, new.service_id::text), 0));
  else
    perform pg_advisory_xact_lock(hashtextextended(new.service_id::text, 0));
  end if;
  if TG_OP = 'UPDATE' then
    schedule_changed := (old.service_id, old.booking_date, old.start_time, old.end_time, old.seats_booked, old.seat_labels)
      is distinct from (new.service_id, new.booking_date, new.start_time, new.end_time, new.seats_booked, new.seat_labels)
      or (old.status not in ('confirmed','in_progress') and new.status in ('confirmed','in_progress'));
    if not schedule_changed and new.status not in ('confirmed','in_progress') then return new; end if;
  end if;
  select total_seats into strict capacity from public.services where id = new.service_id;
  start_hour := extract(hour from new.start_time)::integer;
  end_hour := extract(hour from new.end_time)::integer;
  if start_hour < 12 then start_hour := start_hour + 24; end if;
  if end_hour < 12 then end_hour := end_hour + 24; end if;
  if start_hour < 12 or start_hour > 25 or end_hour <= start_hour or end_hour > 26
      or extract(minute from new.start_time) <> 0 or extract(second from new.start_time) <> 0
      or extract(minute from new.end_time) <> 0 or extract(second from new.end_time) <> 0 then
    raise exception 'Invalid booking schedule' using errcode = '23514';
  end if;
  if new.seats_booked < 1 or new.seats_booked > capacity then
    raise exception 'Invalid seat count' using errcode = '23514';
  end if;
  new.seat_labels := coalesce(new.seat_labels, '{}');
  if (capacity <> 16 and cardinality(new.seat_labels) > 0)
      or (cardinality(new.seat_labels) > 0 and cardinality(new.seat_labels) <> new.seats_booked)
      or (capacity = 16 and new.interface_type in ('form','walk_in') and cardinality(new.seat_labels) <> new.seats_booked)
      or exists (select 1 from unnest(new.seat_labels) label where label !~ '^RS([1-9]|1[0-6])$')
      or cardinality(new.seat_labels) <> (select count(distinct label) from unnest(new.seat_labels) label) then
    raise exception 'Invalid seat selection' using errcode = '23514';
  end if;
  if new.status not in ('confirmed','in_progress') then return new; end if;
  if schedule_changed then
    first_date := (local_now - interval '2 hours')::date;
    starts_at := new.booking_date + make_interval(hours => start_hour);
    if new.booking_date < first_date or new.booking_date > first_date + 30
        or (starts_at <= local_now and not (new.interface_type = 'walk_in' and local_now < starts_at + interval '1 hour')) then
      raise exception 'Booking is outside the allowed scheduling window' using errcode = '23514';
    end if;
  end if;
  if exists (select 1 from public.service_seat_maintenance where service_id = new.service_id and is_active and seat_label = any(new.seat_labels)) then
    raise exception 'Selected seats are under maintenance' using errcode = '23P01';
  end if;
  select count(*) into blocked from public.service_seat_maintenance where service_id = new.service_id and is_active;
  for slot in start_hour..end_hour-1 loop
    select coalesce(sum(seats_booked), 0) into used from public.bookings b
      where b.service_id = new.service_id and b.booking_date = new.booking_date and b.id <> new.id
      and b.status in ('confirmed','in_progress')
      and (extract(hour from b.start_time)::integer + case when b.start_time < time '12:00' then 24 else 0 end) <= slot
      and (extract(hour from b.end_time)::integer + case when b.end_time < time '12:00' then 24 else 0 end) > slot;
    if used + blocked + new.seats_booked > capacity then
      raise exception 'Not enough seats available' using errcode = '23P01';
    end if;
    if exists (select 1 from public.bookings b
      where b.service_id = new.service_id and b.booking_date = new.booking_date and b.id <> new.id
      and b.status in ('confirmed','in_progress') and b.seat_labels && new.seat_labels
      and (extract(hour from b.start_time)::integer + case when b.start_time < time '12:00' then 24 else 0 end) <= slot
      and (extract(hour from b.end_time)::integer + case when b.end_time < time '12:00' then 24 else 0 end) > slot) then
      raise exception 'Selected seat is already booked' using errcode = '23P01';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.enforce_booking_integrity() from public;
drop trigger if exists booking_integrity on public.bookings;
create trigger booking_integrity before insert or update on public.bookings for each row execute function public.enforce_booking_integrity();
commit;
