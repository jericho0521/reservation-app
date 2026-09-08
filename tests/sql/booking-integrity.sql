do $$
declare service uuid := gen_random_uuid(); first_booking uuid; other_booking uuid; booking_day date := (now() at time zone 'Asia/Kuala_Lumpur')::date + 1;
begin
  insert into public.services(id,name,total_seats) values (service, service::text, 1);
  insert into public.bookings(service_id,user_name,user_email,booking_date,start_time,end_time,seats_booked,interface_type)
    values(service,'Guest','guest@example.test',booking_day,'12:00','13:00',1,'chat') returning id into first_booking;
  begin
    insert into public.bookings(service_id,user_name,user_email,booking_date,start_time,end_time,seats_booked,interface_type)
      values(service,'Guest','guest@example.test',booking_day,'12:00','13:00',1,'chat');
    raise exception 'Expected overbooking rejection';
  exception when exclusion_violation then null;
  end;
  update public.bookings set status='cancelled' where id=first_booking;
  insert into public.bookings(service_id,user_name,user_email,booking_date,start_time,end_time,seats_booked,interface_type)
    values(service,'Guest','guest@example.test',booking_day,'12:00','13:00',1,'chat') returning id into other_booking;
  begin
    update public.bookings set status='confirmed' where id=first_booking;
    raise exception 'Expected reactivation capacity check';
  exception when exclusion_violation then null;
  end;
  begin
    update public.bookings set start_time='10:00', end_time='11:00' where id=other_booking;
    raise exception 'Expected schedule check';
  exception when check_violation then null;
  end;
  if has_table_privilege('anon','public.bookings','INSERT') then raise exception 'Anonymous direct insert remains enabled'; end if;
end;
$$;
