do $$
declare service uuid := gen_random_uuid();
begin
  if not consume_request_budget(array['test:quota'],array[1],60) then raise exception 'First request rejected'; end if;
  if consume_request_budget(array['test:quota'],array[1],60) then raise exception 'Exhausted quota accepted'; end if;
  update request_budgets set expires_at=now()-interval '1 second' where key='test:quota';
  if not consume_request_budget(array['test:quota'],array[1],60) then raise exception 'Expired budget did not reset'; end if;
  if has_function_privilege('anon','consume_request_budget(text[],integer[],integer)','EXECUTE')
    or has_function_privilege('authenticated','consume_request_budget(text[],integer[],integer)','EXECUTE') then
    raise exception 'Public caller can manipulate quotas';
  end if;
  insert into services(id,name,total_seats) values(service,service::text,4);
  insert into bookings(service_id,user_name,user_email,booking_date,start_time,end_time,seats_booked,interface_type,status,request_actor,request_key,request_hash)
    values(service,'Guest','guest@example.test',current_date+1,'12:00','13:00',1,'chat','cancelled','actor','retry','hash');
  begin
    insert into bookings(service_id,user_name,user_email,booking_date,start_time,end_time,seats_booked,interface_type,status,request_actor,request_key,request_hash)
      values(service,'Guest','guest@example.test',current_date+1,'12:00','13:00',1,'chat','cancelled','actor','retry','hash');
    raise exception 'Duplicate request inserted';
  exception when unique_violation then null;
  end;
end;
$$;
