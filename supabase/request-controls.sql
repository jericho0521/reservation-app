begin;
create table if not exists public.request_budgets (
  key text primary key, hits integer not null, expires_at timestamptz not null
);
alter table public.request_budgets enable row level security;
revoke all on public.request_budgets from anon, authenticated;
create or replace function public.consume_request_budget(p_keys text[], p_limits integer[], p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
declare entry record; consumed integer; expiry timestamptz := clock_timestamp() + make_interval(secs => p_window_seconds);
begin
  if cardinality(p_keys) <> cardinality(p_limits) or cardinality(p_keys) not between 1 and 10 or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid request budget';
  end if;
  delete from public.request_budgets where expires_at < clock_timestamp() - interval '1 day';
  for entry in select key, max_hits from unnest(p_keys,p_limits) as limits(key,max_hits) order by key loop
    if entry.max_hits < 1 then raise exception 'Invalid request limit'; end if;
    insert into public.request_budgets as budgets(key,hits,expires_at) values(entry.key,1,expiry)
      on conflict(key) do update set
        hits = case when budgets.expires_at <= clock_timestamp() then 1 else least(budgets.hits + 1, entry.max_hits + 1) end,
        expires_at = case when budgets.expires_at <= clock_timestamp() then expiry else budgets.expires_at end
      returning hits into consumed;
    if consumed > entry.max_hits then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.consume_request_budget(text[],integer[],integer) from public, anon, authenticated;
grant execute on function public.consume_request_budget(text[],integer[],integer) to service_role;
alter table public.bookings add column if not exists request_actor text;
alter table public.bookings add column if not exists request_key text;
alter table public.bookings add column if not exists request_hash text;
alter table public.bookings add column if not exists confirmation_email_sent boolean not null default false;
create unique index if not exists bookings_request_identity on public.bookings(request_actor,request_key) where request_actor is not null and request_key is not null;
commit;
