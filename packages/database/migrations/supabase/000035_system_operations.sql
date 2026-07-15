-- Safe, persistent operational state for health, abuse controls, and releases.

create table public.platform_component_heartbeats (
  component text primary key check (component ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  instance_id text not null check (length(trim(instance_id)) between 1 and 128),
  release_version text not null check (length(trim(release_version)) between 1 and 128),
  status text not null check (status in ('healthy', 'degraded')),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096
  ),
  heartbeat_at timestamptz not null
);

create table public.platform_rate_limit_windows (
  bucket_hash text not null check (bucket_hash ~ '^[0-9a-f]{64}$'),
  route_group text not null check (route_group ~ '^[a-z][a-z0-9_]{0,63}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  expires_at timestamptz not null,
  primary key (bucket_hash, route_group, window_started_at),
  check (expires_at > window_started_at)
);

create index platform_rate_limit_windows_expiry_idx
on public.platform_rate_limit_windows (expires_at);

create table public.platform_backup_records (
  id uuid primary key default gen_random_uuid(),
  release_version text not null check (length(trim(release_version)) between 1 and 128),
  migration_version text not null check (migration_version ~ '^\d{6}$'),
  archive_name text not null check (length(trim(archive_name)) between 1 and 255),
  archive_sha256 text check (archive_sha256 is null or archive_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('started', 'verified', 'failed')),
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'started') = (completed_at is null)),
  check (status <> 'verified' or archive_sha256 is not null),
  check (status <> 'failed' or error_code is not null)
);

create index platform_backup_records_started_idx
on public.platform_backup_records (started_at desc);

create table public.platform_upgrade_records (
  id uuid primary key default gen_random_uuid(),
  from_version text not null check (length(trim(from_version)) between 1 and 128),
  to_version text not null check (length(trim(to_version)) between 1 and 128),
  backup_id uuid references public.platform_backup_records(id),
  status text not null check (status in ('started', 'healthy', 'failed', 'rolled_back')),
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'started') = (completed_at is null)),
  check (status not in ('failed', 'rolled_back') or error_code is not null)
);

create index platform_upgrade_records_started_idx
on public.platform_upgrade_records (started_at desc);

create table public.platform_operational_events (
  id bigint generated always as identity primary key,
  component text not null check (component ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  event_code text not null check (event_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  level text not null check (level in ('info', 'warn', 'error')),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096
  ),
  created_at timestamptz not null default now()
);

create index platform_operational_events_created_idx
on public.platform_operational_events (created_at desc);

create or replace function public.platform_validate_release_state_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'platform_backup_records' then
    if old.status <> 'started' or new.status not in ('verified', 'failed') then
      raise exception 'Invalid backup state transition.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'platform_upgrade_records' then
    if not (
      (old.status = 'started' and new.status in ('healthy', 'failed', 'rolled_back'))
      or (old.status = 'failed' and new.status = 'rolled_back')
    ) then
      raise exception 'Invalid upgrade state transition.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger platform_backup_records_transition
before update of status on public.platform_backup_records
for each row when (old.status is distinct from new.status)
execute function public.platform_validate_release_state_transition();

create trigger platform_upgrade_records_transition
before update of status on public.platform_upgrade_records
for each row when (old.status is distinct from new.status)
execute function public.platform_validate_release_state_transition();

create or replace function public.record_platform_component_heartbeat(
  p_component text,
  p_instance_id text,
  p_release_version text,
  p_status text,
  p_metadata jsonb default '{}'::jsonb,
  p_heartbeat_at timestamptz default now()
)
returns public.platform_component_heartbeats
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.platform_component_heartbeats;
begin
  insert into public.platform_component_heartbeats (
    component, instance_id, release_version, status, metadata, heartbeat_at
  ) values (
    trim(p_component), trim(p_instance_id), trim(p_release_version), p_status,
    coalesce(p_metadata, '{}'::jsonb), coalesce(p_heartbeat_at, now())
  )
  on conflict (component) do update set
    instance_id = excluded.instance_id,
    release_version = excluded.release_version,
    status = excluded.status,
    metadata = excluded.metadata,
    heartbeat_at = excluded.heartbeat_at
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.read_platform_component_heartbeats()
returns setof public.platform_component_heartbeats
language sql
security definer
set search_path = public
as $$
  select * from public.platform_component_heartbeats order by component;
$$;

create or replace function public.consume_platform_rate_limit(
  p_bucket_hash text,
  p_route_group text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window timestamptz;
  v_count integer;
  v_expires timestamptz;
begin
  if p_bucket_hash !~ '^[0-9a-f]{64}$'
    or p_route_group !~ '^[a-z][a-z0-9_]{0,63}$'
    or p_limit not between 1 and 10000
    or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit parameters.' using errcode = '22023';
  end if;

  v_window := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);
  v_expires := v_window + make_interval(secs => p_window_seconds);

  insert into public.platform_rate_limit_windows (
    bucket_hash, route_group, window_started_at, request_count, expires_at
  ) values (p_bucket_hash, p_route_group, v_window, 1, v_expires)
  on conflict (bucket_hash, route_group, window_started_at) do update
    set request_count = platform_rate_limit_windows.request_count + 1
  returning request_count into v_count;

  delete from public.platform_rate_limit_windows where expires_at < v_now - interval '1 minute';

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    greatest(1, ceil(extract(epoch from (v_expires - v_now)))::integer);
end;
$$;

create or replace function public.record_platform_backup(
  p_release_version text,
  p_migration_version text,
  p_archive_name text
)
returns public.platform_backup_records
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.platform_backup_records;
begin
  insert into public.platform_backup_records (release_version, migration_version, archive_name, status)
  values (trim(p_release_version), trim(p_migration_version), trim(p_archive_name), 'started')
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.transition_platform_backup(
  p_id uuid,
  p_status text,
  p_archive_sha256 text default null,
  p_error_code text default null
)
returns public.platform_backup_records
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.platform_backup_records;
begin
  update public.platform_backup_records set
    status = p_status,
    archive_sha256 = case when p_status = 'verified' then p_archive_sha256 else archive_sha256 end,
    error_code = case when p_status = 'failed' then p_error_code else null end,
    completed_at = now()
  where id = p_id
  returning * into v_row;
  if v_row.id is null then raise exception 'Backup record not found.' using errcode = 'P0002'; end if;
  return v_row;
end;
$$;

create or replace function public.record_platform_upgrade(
  p_from_version text,
  p_to_version text,
  p_backup_id uuid default null
)
returns public.platform_upgrade_records
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.platform_upgrade_records;
begin
  if p_backup_id is not null and not exists (
    select 1 from public.platform_backup_records where id = p_backup_id and status = 'verified'
  ) then
    raise exception 'Upgrade requires a verified backup.' using errcode = '23514';
  end if;
  insert into public.platform_upgrade_records (from_version, to_version, backup_id, status)
  values (trim(p_from_version), trim(p_to_version), p_backup_id, 'started')
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.transition_platform_upgrade(
  p_id uuid,
  p_status text,
  p_error_code text default null
)
returns public.platform_upgrade_records
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.platform_upgrade_records;
begin
  update public.platform_upgrade_records set
    status = p_status,
    error_code = case when p_status in ('failed', 'rolled_back') then p_error_code else null end,
    completed_at = now()
  where id = p_id
  returning * into v_row;
  if v_row.id is null then raise exception 'Upgrade record not found.' using errcode = 'P0002'; end if;
  return v_row;
end;
$$;

create or replace function public.record_platform_operational_event(
  p_component text,
  p_event_code text,
  p_level text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.platform_operational_events
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.platform_operational_events;
begin
  insert into public.platform_operational_events (component, event_code, level, metadata)
  values (trim(p_component), trim(p_event_code), p_level, coalesce(p_metadata, '{}'::jsonb))
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.read_platform_operational_events(p_limit integer default 50)
returns setof public.platform_operational_events
language sql
security definer
set search_path = public
as $$
  select * from public.platform_operational_events
  order by created_at desc, id desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create or replace function public.read_platform_system_operations()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'heartbeats', coalesce((select jsonb_agg(to_jsonb(h) order by h.component) from public.platform_component_heartbeats h), '[]'::jsonb),
    'jobs', jsonb_build_object(
      'pending', (select count(*) from public.platform_jobs where status in ('pending', 'leased')),
      'failed', (select count(*) from public.platform_jobs where status = 'failed'),
      'oldest_pending_at', (select min(created_at) from public.platform_jobs where status in ('pending', 'leased'))
    ),
    'last_verified_backup', (select to_jsonb(b) from public.platform_backup_records b where status = 'verified' order by completed_at desc limit 1),
    'latest_upgrade', (select to_jsonb(u) from public.platform_upgrade_records u order by started_at desc limit 1),
    'integrations', coalesce((select jsonb_object_agg(kind, jsonb_build_object('enabled', enabled, 'updated_at', updated_at)) from public.platform_integration_settings), '{}'::jsonb),
    'whatsapp', (select jsonb_build_object('status', status, 'last_connected_at', last_connected_at, 'updated_at', updated_at) from public.platform_whatsapp_sessions order by updated_at desc limit 1)
  );
$$;

alter table public.platform_component_heartbeats enable row level security;
alter table public.platform_rate_limit_windows enable row level security;
alter table public.platform_backup_records enable row level security;
alter table public.platform_upgrade_records enable row level security;
alter table public.platform_operational_events enable row level security;

revoke all on table public.platform_component_heartbeats, public.platform_rate_limit_windows,
  public.platform_backup_records, public.platform_upgrade_records, public.platform_operational_events
  from public, anon, authenticated, service_role;

revoke execute on function public.record_platform_component_heartbeat(text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public.read_platform_component_heartbeats() from public, anon, authenticated;
revoke execute on function public.consume_platform_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.read_platform_system_operations() from public, anon, authenticated;
revoke execute on function public.record_platform_backup(text, text, text) from public, anon, authenticated;
revoke execute on function public.transition_platform_backup(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.record_platform_upgrade(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.transition_platform_upgrade(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.record_platform_operational_event(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.read_platform_operational_events(integer) from public, anon, authenticated;
grant execute on function public.record_platform_component_heartbeat(text, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.read_platform_component_heartbeats() to service_role;
grant execute on function public.consume_platform_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.read_platform_system_operations() to service_role;
grant execute on function public.record_platform_backup(text, text, text) to service_role;
grant execute on function public.transition_platform_backup(uuid, text, text, text) to service_role;
grant execute on function public.record_platform_upgrade(text, text, uuid) to service_role;
grant execute on function public.transition_platform_upgrade(uuid, text, text) to service_role;
grant execute on function public.record_platform_operational_event(text, text, text, jsonb) to service_role;
grant execute on function public.read_platform_operational_events(integer) to service_role;
