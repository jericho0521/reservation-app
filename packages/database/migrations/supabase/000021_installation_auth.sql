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

create unique index platform_users_tenant_id_id_key
on public.platform_users (tenant_id, id);

create table public.platform_user_venue_assignments (
  tenant_id text not null,
  user_id uuid not null,
  venue_id uuid not null,
  primary key (user_id, venue_id),
  foreign key (tenant_id, user_id)
    references public.platform_users (tenant_id, id) on delete cascade,
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete cascade
);

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
  venue_id uuid,
  actor_user_id uuid,
  action text not null check (length(trim(action)) > 0),
  entity_type text not null check (length(trim(entity_type)) > 0),
  entity_id text,
  before_value jsonb,
  after_value jsonb,
  reason text,
  correlation_id text,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, venue_id) references public.venues (tenant_id, id),
  foreign key (tenant_id, actor_user_id) references public.platform_users (tenant_id, id)
);

create or replace function public.platform_create_user(
  p_tenant_id text,
  p_email text,
  p_display_name text,
  p_password_hash text,
  p_role text,
  p_status text,
  p_venue_ids uuid[]
)
returns table (
  id uuid,
  tenant_id text,
  email text,
  display_name text,
  password_hash text,
  role text,
  status text,
  venue_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_user public.platform_users%rowtype;
  normalized_venue_ids uuid[];
begin
  select coalesce(array_agg(distinct venue_id order by venue_id), array[]::uuid[])
  into normalized_venue_ids
  from unnest(coalesce(p_venue_ids, array[]::uuid[])) as venues(venue_id);

  insert into public.platform_users (
    tenant_id,
    email,
    display_name,
    password_hash,
    role,
    status
  ) values (
    p_tenant_id,
    lower(trim(p_email)),
    trim(p_display_name),
    p_password_hash,
    p_role,
    p_status
  )
  returning * into created_user;

  insert into public.platform_user_venue_assignments (tenant_id, user_id, venue_id)
  select created_user.tenant_id, created_user.id, venue_id
  from unnest(normalized_venue_ids) as venues(venue_id);

  return query select
    created_user.id,
    created_user.tenant_id,
    created_user.email,
    created_user.display_name,
    created_user.password_hash,
    created_user.role,
    created_user.status,
    normalized_venue_ids;
end;
$$;

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

create or replace function public.platform_create_staff_invitation(
  p_tenant_id text,
  p_email text,
  p_display_name text,
  p_placeholder_password_hash text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_venue_ids uuid[]
)
returns table (
  id uuid,
  tenant_id text,
  email text,
  display_name text,
  password_hash text,
  role text,
  status text,
  venue_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_user public.platform_users%rowtype;
  normalized_email text := lower(trim(p_email));
  normalized_venue_ids uuid[];
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_expires_at <= now() then
    raise exception 'Invalid staff invitation capability.';
  end if;

  select coalesce(array_agg(distinct venue_id order by venue_id), array[]::uuid[])
  into normalized_venue_ids
  from unnest(coalesce(p_venue_ids, array[]::uuid[])) as venues(venue_id);

  insert into public.platform_users (
    tenant_id, email, display_name, password_hash, role, status
  ) values (
    p_tenant_id, normalized_email, trim(p_display_name),
    p_placeholder_password_hash, 'staff', 'invited'
  )
  returning * into created_user;

  insert into public.platform_user_venue_assignments (tenant_id, user_id, venue_id)
  select created_user.tenant_id, created_user.id, venue_id
  from unnest(normalized_venue_ids) as venues(venue_id);

  insert into public.platform_auth_tokens (
    user_id, purpose, token_hash, expires_at
  ) values (
    created_user.id, 'invitation', p_token_hash, p_expires_at
  );

  return query select
    created_user.id,
    created_user.tenant_id,
    created_user.email,
    created_user.display_name,
    created_user.password_hash,
    created_user.role,
    created_user.status,
    normalized_venue_ids;
end;
$$;

create or replace function public.platform_accept_staff_invitation(
  p_token_hash text,
  p_now timestamptz,
  p_display_name text,
  p_password_hash text
)
returns table (
  id uuid,
  tenant_id text,
  email text,
  display_name text,
  password_hash text,
  role text,
  status text,
  venue_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.platform_auth_tokens%rowtype;
  activated_user public.platform_users%rowtype;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then
    return;
  end if;

  select candidate.* into invitation
  from public.platform_auth_tokens as candidate
  join public.platform_users as invited_user on invited_user.id = candidate.user_id
  where candidate.purpose = 'invitation'
    and candidate.token_hash = p_token_hash
    and candidate.consumed_at is null
    and candidate.expires_at > p_now
    and invited_user.role = 'staff'
    and invited_user.status = 'invited'
  for update of candidate, invited_user;

  if not found then
    return;
  end if;

  update public.platform_users
  set display_name = trim(p_display_name),
      password_hash = p_password_hash,
      status = 'active',
      updated_at = p_now
  where platform_users.id = invitation.user_id
  returning * into activated_user;

  update public.platform_auth_tokens
  set consumed_at = p_now
  where platform_auth_tokens.id = invitation.id;

  return query select
    activated_user.id,
    activated_user.tenant_id,
    activated_user.email,
    activated_user.display_name,
    activated_user.password_hash,
    activated_user.role,
    activated_user.status,
    coalesce((
      select array_agg(assignment.venue_id order by assignment.venue_id)
      from public.platform_user_venue_assignments as assignment
      where assignment.user_id = activated_user.id
    ), array[]::uuid[]);
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
revoke all on function public.platform_create_user(text, text, text, text, text, text, uuid[]) from public, anon, authenticated;
revoke all on function public.platform_create_first_owner(text, timestamptz, text, text, text) from public, anon, authenticated;
revoke all on function public.platform_create_staff_invitation(text, text, text, text, text, timestamptz, uuid[]) from public, anon, authenticated;
revoke all on function public.platform_accept_staff_invitation(text, timestamptz, text, text) from public, anon, authenticated;

grant select, insert, update, delete on table public.platform_installation to service_role;
grant select, insert, update, delete on table public.platform_users to service_role;
grant select, insert, update, delete on table public.platform_user_venue_assignments to service_role;
grant select, insert, update, delete on table public.platform_sessions to service_role;
grant select, insert, update, delete on table public.platform_auth_tokens to service_role;
grant select, insert on table public.platform_audit_events to service_role;
grant usage, select on sequence public.platform_audit_events_id_seq to service_role;
grant execute on function public.platform_create_user(text, text, text, text, text, text, uuid[]) to service_role;
grant execute on function public.platform_create_first_owner(text, timestamptz, text, text, text) to service_role;
grant execute on function public.platform_create_staff_invitation(text, text, text, text, text, timestamptz, uuid[]) to service_role;
grant execute on function public.platform_accept_staff_invitation(text, timestamptz, text, text) to service_role;
