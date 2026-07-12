-- Experience Studio tenant, business profile, versioned configuration, and
-- atomic publication foundation. Direct table access remains service-role only;
-- browser and owner clients must use the standalone API.

create table if not exists public.tenants (
  id text primary key check (length(trim(id)) > 0),
  name text not null check (length(trim(name)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.tenants (id, name)
values ('platform_default', 'Reservation Platform')
on conflict (id) do nothing;

alter table public.venues add column if not exists tenant_id text references public.tenants(id);
update public.venues set tenant_id = 'platform_default' where tenant_id is null;

insert into public.venues (id, tenant_id, name)
select '00000000-0000-0000-0000-000000000001', 'platform_default', 'Reservation Business'
where not exists (select 1 from public.venues);

alter table public.venues alter column tenant_id set not null;
create unique index if not exists venues_tenant_id_id_key on public.venues (tenant_id, id);

alter table public.services add column if not exists venue_id uuid references public.venues(id);
update public.services
set venue_id = (select id from public.venues order by created_at, id limit 1)
where venue_id is null;
alter table public.services alter column venue_id set not null;
create index if not exists services_venue_id_idx on public.services (venue_id, updated_at desc);

create table if not exists public.platform_business_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  venue_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  public_slug text not null check (
    public_slug = lower(public_slug)
    and public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  preset_id text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, venue_id),
  foreign key (tenant_id, venue_id) references public.venues (tenant_id, id)
);

create unique index if not exists platform_business_profiles_slug_key
on public.platform_business_profiles (lower(public_slug));

create table if not exists public.platform_experience_configurations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.platform_business_profiles(id) on delete cascade,
  version integer not null check (version > 0),
  state text not null default 'draft' check (state in ('draft', 'published', 'archived')),
  preset_id text not null,
  branding jsonb not null,
  terminology jsonb not null,
  channels jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (business_id, version)
);

create unique index if not exists platform_experience_one_draft_idx
on public.platform_experience_configurations (business_id) where state = 'draft';

create unique index if not exists platform_experience_one_published_idx
on public.platform_experience_configurations (business_id) where state = 'published';

drop trigger if exists set_tenants_updated_at on public.tenants;
create trigger set_tenants_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

drop trigger if exists set_platform_business_profiles_updated_at on public.platform_business_profiles;
create trigger set_platform_business_profiles_updated_at
before update on public.platform_business_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_platform_experience_configurations_updated_at on public.platform_experience_configurations;
create trigger set_platform_experience_configurations_updated_at
before update on public.platform_experience_configurations
for each row execute function public.set_updated_at();

alter table public.tenants enable row level security;
alter table public.platform_business_profiles enable row level security;
alter table public.platform_experience_configurations enable row level security;

revoke all on table public.tenants from anon, authenticated;
revoke all on table public.platform_business_profiles from anon, authenticated;
revoke all on table public.platform_experience_configurations from anon, authenticated;

grant select, insert, update, delete on table public.tenants to service_role;
grant select, insert, update, delete on table public.platform_business_profiles to service_role;
grant select, insert, update, delete on table public.platform_experience_configurations to service_role;

create or replace function public.platform_publish_experience_configuration(
  p_tenant_id text,
  p_venue_id uuid,
  p_configuration_id uuid
)
returns public.platform_experience_configurations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.platform_business_profiles;
  v_configuration public.platform_experience_configurations;
begin
  select business.*
  into v_business
  from public.platform_business_profiles as business
  where business.tenant_id = p_tenant_id
    and business.venue_id = p_venue_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Experience business profile not found.';
  end if;

  select configuration.*
  into v_configuration
  from public.platform_experience_configurations as configuration
  where configuration.id = p_configuration_id
    and configuration.business_id = v_business.id
    and configuration.state = 'draft'
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Experience draft not found.';
  end if;

  update public.platform_experience_configurations
  set state = 'archived'
  where business_id = v_business.id
    and state = 'published';

  update public.platform_experience_configurations
  set state = 'published',
      published_at = now()
  where id = v_configuration.id
  returning * into v_configuration;

  update public.platform_business_profiles
  set status = 'published',
      preset_id = v_configuration.preset_id
  where id = v_business.id;

  return v_configuration;
end;
$$;

revoke all on function public.platform_publish_experience_configuration(text, uuid, uuid) from public;
grant execute on function public.platform_publish_experience_configuration(text, uuid, uuid) to service_role;
