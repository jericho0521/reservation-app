-- PostgreSQL-backed jobs with atomic leases and restart-safe notification state.

create table public.platform_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete set null,
  kind text not null check (kind in (
    'notification.email',
    'whatsapp.start_session',
    'whatsapp.restore_session',
    'whatsapp.logout_session',
    'whatsapp.process_inbound',
    'whatsapp.deliver_outbound',
    'conversation.process_ai'
  )),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'leased', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 100),
  available_at timestamptz not null default now(),
  lease_owner text,
  leased_until timestamptz,
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  idempotency_key text not null
    check (length(trim(idempotency_key)) between 1 and 255),
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  check (
    (status = 'leased' and lease_owner is not null and leased_until is not null)
    or (status <> 'leased' and lease_owner is null and leased_until is null)
  ),
  check (attempts <= max_attempts),
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'failed') = (failed_at is not null))
);

create index platform_jobs_claim_idx
on public.platform_jobs (available_at, created_at)
where status = 'pending';

create index platform_jobs_expired_lease_idx
on public.platform_jobs (leased_until)
where status = 'leased';

create index platform_jobs_tenant_status_idx
on public.platform_jobs (tenant_id, status, created_at desc);

create trigger platform_jobs_updated_at
before update on public.platform_jobs
for each row execute function public.set_updated_at();

create or replace function public.platform_validate_job_venue_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.venue_id is not null and not exists (
    select 1
    from public.venues as venue
    where venue.id = new.venue_id
      and venue.tenant_id = new.tenant_id
  ) then
    raise exception 'Platform job venue is outside its tenant.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger platform_jobs_validate_venue_scope
before insert or update of tenant_id, venue_id on public.platform_jobs
for each row execute function public.platform_validate_job_venue_scope();

create table public.platform_notification_deliveries (
  tenant_id text not null references public.tenants(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  notification_kind text not null
    check (notification_kind ~ '^[a-z][a-z0-9_.]{0,127}$'),
  provider_message_id text,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  final_failure_code text
    check (final_failure_code is null or final_failure_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (booking_id, notification_kind),
  check (delivered_at is null or final_failure_code is null)
);

create index platform_notification_deliveries_tenant_idx
on public.platform_notification_deliveries (tenant_id, created_at desc);

create trigger platform_notification_deliveries_updated_at
before update on public.platform_notification_deliveries
for each row execute function public.set_updated_at();

create or replace function public.platform_validate_notification_booking_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.bookings as booking
    join public.services as service on service.id = booking.service_id
    join public.venues as venue on venue.id = service.venue_id
    where booking.id = new.booking_id
      and venue.tenant_id = new.tenant_id
  ) then
    raise exception 'Notification delivery booking is outside its tenant.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger platform_notification_deliveries_validate_booking_scope
before insert or update of tenant_id, booking_id on public.platform_notification_deliveries
for each row execute function public.platform_validate_notification_booking_scope();

create or replace function public.enqueue_platform_job(
  p_tenant_id text,
  p_venue_id uuid,
  p_kind text,
  p_payload jsonb,
  p_max_attempts integer,
  p_available_at timestamptz,
  p_idempotency_key text
)
returns table (job_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.platform_jobs (
    tenant_id,
    venue_id,
    kind,
    payload,
    max_attempts,
    available_at,
    idempotency_key
  ) values (
    p_tenant_id,
    p_venue_id,
    p_kind,
    p_payload,
    p_max_attempts,
    coalesce(p_available_at, now()),
    trim(p_idempotency_key)
  )
  on conflict (tenant_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning platform_jobs.id;
end;
$$;

create or replace function public.claim_platform_jobs(
  p_worker_id text,
  p_limit integer,
  p_lease_seconds integer
)
returns table (
  job_id uuid,
  tenant_id text,
  venue_id uuid,
  kind text,
  payload jsonb,
  attempts integer,
  max_attempts integer,
  available_at timestamptz,
  leased_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(p_worker_id)) not between 1 and 128
    or p_limit not between 1 and 100
    or p_lease_seconds not between 1 and 3600 then
    raise exception 'Invalid platform job claim parameters.';
  end if;

  update public.platform_jobs as exhausted
  set status = 'failed',
      lease_owner = null,
      leased_until = null,
      error_code = 'lease_expired',
      failed_at = now()
  where exhausted.status = 'leased'
    and exhausted.leased_until <= now()
    and exhausted.attempts >= exhausted.max_attempts;

  return query
  with claimable as materialized (
    select candidate.id
    from public.platform_jobs as candidate
    where candidate.attempts < candidate.max_attempts
      and (
        (candidate.status = 'pending' and candidate.available_at <= now())
        or (candidate.status = 'leased' and candidate.leased_until <= now())
      )
    order by candidate.available_at, candidate.created_at, candidate.id
    for update skip locked
    limit p_limit
  )
  update public.platform_jobs as claimed
  set status = 'leased',
      attempts = claimed.attempts + 1,
      lease_owner = trim(p_worker_id),
      leased_until = now() + make_interval(secs => p_lease_seconds),
      error_code = null,
      completed_at = null,
      failed_at = null
  from claimable
  where claimed.id = claimable.id
  returning
    claimed.id,
    claimed.tenant_id,
    claimed.venue_id,
    claimed.kind,
    claimed.payload,
    claimed.attempts,
    claimed.max_attempts,
    claimed.available_at,
    claimed.leased_until;
end;
$$;

create or replace function public.complete_platform_job(p_job_id uuid, p_worker_id text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with transitioned as (
    update public.platform_jobs as job
    set status = 'completed',
        lease_owner = null,
        leased_until = null,
        error_code = null,
        completed_at = now(),
        failed_at = null
    where job.id = p_job_id
      and job.status = 'leased'
      and job.lease_owner = p_worker_id
      and job.leased_until > now()
    returning 1
  )
  select exists(select 1 from transitioned);
$$;

create or replace function public.retry_platform_job(
  p_job_id uuid,
  p_worker_id text,
  p_available_at timestamptz,
  p_error_code text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with transitioned as (
    update public.platform_jobs as job
    set status = 'pending',
        available_at = p_available_at,
        lease_owner = null,
        leased_until = null,
        error_code = p_error_code,
        completed_at = null,
        failed_at = null
    where job.id = p_job_id
      and job.status = 'leased'
      and job.lease_owner = p_worker_id
      and job.leased_until > now()
      and job.attempts < job.max_attempts
    returning 1
  )
  select exists(select 1 from transitioned);
$$;

create or replace function public.fail_platform_job(
  p_job_id uuid,
  p_worker_id text,
  p_error_code text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with transitioned as (
    update public.platform_jobs as job
    set status = 'failed',
        lease_owner = null,
        leased_until = null,
        error_code = p_error_code,
        completed_at = null,
        failed_at = now()
    where job.id = p_job_id
      and job.status = 'leased'
      and job.lease_owner = p_worker_id
      and job.leased_until > now()
    returning 1
  )
  select exists(select 1 from transitioned);
$$;

alter table public.platform_jobs enable row level security;
alter table public.platform_notification_deliveries enable row level security;

revoke all on table public.platform_jobs from public, anon, authenticated, service_role;
revoke all on table public.platform_notification_deliveries from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.platform_jobs to service_role;
grant select, insert, update, delete on table public.platform_notification_deliveries to service_role;

revoke execute on function public.enqueue_platform_job(text, uuid, text, jsonb, integer, timestamptz, text)
  from public, anon, authenticated;
revoke execute on function public.claim_platform_jobs(text, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.complete_platform_job(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.retry_platform_job(uuid, text, timestamptz, text)
  from public, anon, authenticated;
revoke execute on function public.fail_platform_job(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.enqueue_platform_job(text, uuid, text, jsonb, integer, timestamptz, text)
  to service_role;
grant execute on function public.claim_platform_jobs(text, integer, integer)
  to service_role;
grant execute on function public.complete_platform_job(uuid, text)
  to service_role;
grant execute on function public.retry_platform_job(uuid, text, timestamptz, text)
  to service_role;
grant execute on function public.fail_platform_job(uuid, text, text)
  to service_role;
