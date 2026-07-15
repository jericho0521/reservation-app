-- Single-installation identity, built-in users, hashed sessions/auth tokens,
-- venue assignments, and privileged audit history. Direct table access remains
-- service-role only; browser clients authenticate through the platform API.

create table public.platform_installation (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  tenant_id text not null references public.tenants(id),
  domain text not null check (length(trim(domain)) > 0),
  setup_token_hash text,
  setup_expires_at timestamptz,
  setup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (setup_token_hash is null or setup_token_hash ~ '^[a-f0-9]{64}$')
);

create table public.platform_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id),
  email text not null check (length(trim(email)) > 0),
  display_name text not null check (length(trim(display_name)) > 0),
  password_hash text not null check (length(password_hash) > 0),
  role text not null check (role in ('owner', 'staff')),
  status text not null default 'active' check (status in ('invited', 'active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index platform_users_tenant_email_key
on public.platform_users (tenant_id, lower(email));

create table public.platform_user_venue_assignments (
  user_id uuid not null references public.platform_users(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  primary key (user_id, venue_id)
);

create or replace function public.platform_enforce_user_venue_assignment_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  user_tenant_id text;
  venue_tenant_id text;
begin
  select tenant_id into user_tenant_id
  from public.platform_users
  where id = new.user_id;

  select tenant_id into venue_tenant_id
  from public.venues
  where id = new.venue_id;

  if user_tenant_id is distinct from venue_tenant_id then
    raise exception using
      errcode = '23514',
      message = 'Platform user and venue must belong to the same tenant.';
  end if;
  return new;
end;
$$;

create trigger enforce_platform_user_venue_assignment_tenant
before insert or update on public.platform_user_venue_assignments
for each row execute function public.platform_enforce_user_venue_assignment_tenant();

create table public.platform_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.platform_users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.platform_auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.platform_users(id) on delete cascade,
  purpose text not null check (purpose in ('invitation', 'password_reset')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.platform_audit_events (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.tenants(id),
  venue_id uuid references public.venues(id),
  actor_user_id uuid references public.platform_users(id),
  action text not null check (length(trim(action)) > 0),
  entity_type text not null check (length(trim(entity_type)) > 0),
  entity_id text,
  before_value jsonb,
  after_value jsonb,
  reason text,
  correlation_id text,
  created_at timestamptz not null default now()
);

create or replace function public.platform_create_first_owner(
  p_setup_token_hash text,
  p_now timestamptz,
  p_email text,
  p_display_name text,
  p_password_hash text
)
returns table (
  installation_id uuid,
  tenant_id text,
  domain text,
  setup_completed_at timestamptz,
  user_id uuid,
  email text,
  display_name text,
  password_hash text,
  role text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  installation public.platform_installation%rowtype;
  created_user public.platform_users%rowtype;
begin
  if p_setup_token_hash !~ '^[a-f0-9]{64}$' then
    return;
  end if;

  select candidate.* into installation
  from public.platform_installation as candidate
  where candidate.singleton = true
    and candidate.setup_token_hash = p_setup_token_hash
    and candidate.setup_completed_at is null
    and candidate.setup_expires_at > p_now
  for update;

  if not found then
    return;
  end if;

  insert into public.platform_users (
    tenant_id,
    email,
    display_name,
    password_hash,
    role,
    status
  ) values (
    installation.tenant_id,
    lower(trim(p_email)),
    trim(p_display_name),
    p_password_hash,
    'owner',
    'active'
  )
  returning * into created_user;

  update public.platform_installation
  set setup_token_hash = null,
      setup_completed_at = p_now,
      updated_at = p_now
  where id = installation.id
  returning * into installation;

  return query select
    installation.id,
    installation.tenant_id,
    installation.domain,
    installation.setup_completed_at,
    created_user.id,
    created_user.email,
    created_user.display_name,
    created_user.password_hash,
    created_user.role,
    created_user.status;
end;
$$;

create index platform_sessions_active_lookup_idx
on public.platform_sessions (token_hash, expires_at)
where revoked_at is null;

create index platform_user_venue_assignments_venue_idx
on public.platform_user_venue_assignments (venue_id, user_id);

create index platform_audit_events_tenant_created_idx
on public.platform_audit_events (tenant_id, created_at desc);

drop trigger if exists set_platform_installation_updated_at on public.platform_installation;
create trigger set_platform_installation_updated_at
before update on public.platform_installation
for each row execute function public.set_updated_at();

drop trigger if exists set_platform_users_updated_at on public.platform_users;
create trigger set_platform_users_updated_at
before update on public.platform_users
for each row execute function public.set_updated_at();

alter table public.platform_installation enable row level security;
alter table public.platform_users enable row level security;
alter table public.platform_user_venue_assignments enable row level security;
alter table public.platform_sessions enable row level security;
alter table public.platform_auth_tokens enable row level security;
alter table public.platform_audit_events enable row level security;

revoke all on table public.platform_installation from public, anon, authenticated;
revoke all on table public.platform_users from public, anon, authenticated;
revoke all on table public.platform_user_venue_assignments from public, anon, authenticated;
revoke all on table public.platform_sessions from public, anon, authenticated;
revoke all on table public.platform_auth_tokens from public, anon, authenticated;
revoke all on table public.platform_audit_events from public, anon, authenticated;
revoke all on sequence public.platform_audit_events_id_seq from public, anon, authenticated;
revoke all on function public.platform_enforce_user_venue_assignment_tenant() from public, anon, authenticated;
revoke all on function public.platform_create_first_owner(text, timestamptz, text, text, text) from public, anon, authenticated;

grant select, insert, update, delete on table public.platform_installation to service_role;
grant select, insert, update, delete on table public.platform_users to service_role;
grant select, insert, update, delete on table public.platform_user_venue_assignments to service_role;
grant select, insert, update, delete on table public.platform_sessions to service_role;
grant select, insert, update, delete on table public.platform_auth_tokens to service_role;
grant select, insert on table public.platform_audit_events to service_role;
grant usage, select on sequence public.platform_audit_events_id_seq to service_role;
grant execute on function public.platform_create_first_owner(text, timestamptz, text, text, text) to service_role;
