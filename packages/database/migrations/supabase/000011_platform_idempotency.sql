-- Reservation platform database bundle artifact.
-- Source: packages/reservations-supabase/sql/platform-idempotency.sql
-- Section: platform_idempotency_records table and platform_claim/store
-- idempotency RPCs.
-- Status: concrete package-owned migration asset. This file is intended to be
-- runnable as part of the backend database package, but durable live
-- idempotency behavior against a migrated database is still pending proof.
--
-- Durable platform idempotency records for backend-owned mutation replay.
--
-- Apply after tenant/auth core schema. The RPCs keep claim/store semantics
-- atomic in Postgres so application code does not need select-then-insert
-- coordination.

create table if not exists public.platform_idempotency_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  key text not null,
  method text not null,
  path text not null,
  fingerprint text not null,
  status text not null default 'in_progress',
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  constraint platform_idempotency_records_status_check
    check (status in ('in_progress', 'completed')),
  constraint platform_idempotency_records_response_check
    check (
      (status = 'in_progress' and response_status is null and response_body is null and completed_at is null)
      or
      (status = 'completed' and response_status is not null and completed_at is not null)
    ),
  constraint platform_idempotency_records_key_scope_unique
    unique (tenant_id, key)
);

create index if not exists platform_idempotency_records_updated_at_idx
  on public.platform_idempotency_records (updated_at);

create or replace function public.platform_normalize_idempotency_tenant(p_tenant_id text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(nullif(trim(p_tenant_id), ''), '__platform_unscoped__')
$$;

create or replace function public.platform_claim_idempotency_record(
  p_key text,
  p_tenant_id text,
  p_method text,
  p_path text,
  p_fingerprint text
)
returns table (
  claimed boolean,
  tenant_id text,
  key text,
  method text,
  path text,
  fingerprint text,
  status text,
  response_status integer,
  response_body jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id text := public.platform_normalize_idempotency_tenant(p_tenant_id);
  v_record public.platform_idempotency_records%rowtype;
  v_claimed boolean := false;
begin
  insert into public.platform_idempotency_records (
    tenant_id,
    key,
    method,
    path,
    fingerprint,
    status
  )
  values (
    v_tenant_id,
    p_key,
    upper(trim(p_method)),
    p_path,
    p_fingerprint,
    'in_progress'
  )
  on conflict (tenant_id, key) do nothing
  returning * into v_record;

  if found then
    v_claimed := true;
  else
    select *
    into v_record
    from public.platform_idempotency_records existing
    where existing.tenant_id = v_tenant_id
      and existing.key = p_key;
  end if;

  return query
  select
    v_claimed,
    v_record.tenant_id,
    v_record.key,
    v_record.method,
    v_record.path,
    v_record.fingerprint,
    v_record.status,
    v_record.response_status,
    v_record.response_body,
    v_record.created_at,
    v_record.updated_at,
    v_record.completed_at;
end;
$$;

create or replace function public.platform_store_idempotency_record(
  p_key text,
  p_tenant_id text,
  p_method text,
  p_path text,
  p_fingerprint text,
  p_response_status integer,
  p_response_body jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id text := public.platform_normalize_idempotency_tenant(p_tenant_id);
  v_method text := upper(trim(p_method));
  v_existing public.platform_idempotency_records%rowtype;
begin
  select *
  into v_existing
  from public.platform_idempotency_records existing
  where existing.tenant_id = v_tenant_id
    and existing.key = p_key
  for update;

  if not found then
    raise exception 'idempotency record must be claimed before completion'
      using errcode = '23503';
  end if;

  if v_existing.method <> v_method
    or v_existing.path <> p_path
    or v_existing.fingerprint <> p_fingerprint then
    raise exception 'idempotency record identity mismatch'
      using errcode = '23505';
  end if;

  update public.platform_idempotency_records
  set
    status = 'completed',
    response_status = p_response_status,
    response_body = p_response_body,
    updated_at = timezone('utc', now()),
    completed_at = timezone('utc', now())
  where tenant_id = v_tenant_id
    and key = p_key;
end;
$$;

revoke all on function public.platform_claim_idempotency_record(text, text, text, text, text) from public;
revoke all on function public.platform_store_idempotency_record(text, text, text, text, text, integer, jsonb) from public;

grant execute on function public.platform_claim_idempotency_record(text, text, text, text, text) to service_role;
grant execute on function public.platform_store_idempotency_record(text, text, text, text, text, integer, jsonb) to service_role;
