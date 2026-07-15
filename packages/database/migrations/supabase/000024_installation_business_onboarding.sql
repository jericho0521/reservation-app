-- Atomic single-business appointment onboarding and tenant-scoped location
-- management. Browser clients use the platform API; only service_role may call
-- these functions directly.

drop index if exists public.venues_name_key;
create unique index if not exists venues_tenant_name_key
on public.venues (tenant_id, lower(name));

create or replace function public.platform_list_installation_locations(
  p_tenant_id text,
  p_venue_ids uuid[] default null
)
returns table (
  location_id uuid,
  name text,
  address text,
  timezone text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    venue.id,
    venue.name,
    venue.address,
    coalesce(settings.timezone, 'UTC')
  from public.venues venue
  left join public.platform_availability_settings settings
    on settings.tenant_id = venue.tenant_id
   and settings.venue_id = venue.id
  where venue.tenant_id = p_tenant_id
    and (p_venue_ids is null or venue.id = any(p_venue_ids))
  order by venue.created_at, venue.id;
$$;

create or replace function public.platform_read_installation_business(
  p_tenant_id text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with profile as (
    select business.*
    from public.platform_business_profiles business
    where business.tenant_id = p_tenant_id
      and business.preset_id = 'appointments_salon'
    order by business.created_at, business.id
    limit 1
  )
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'business_id', profile.id,
      'tenant_id', profile.tenant_id,
      'venue_id', profile.venue_id,
      'name', profile.name,
      'public_slug', profile.public_slug,
      'preset_id', profile.preset_id,
      'status', profile.status
    ),
    'locations', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'location_id', location.location_id,
        'name', location.name,
        'address', location.address,
        'timezone', location.timezone
      )) order by location.location_id)
      from public.platform_list_installation_locations(p_tenant_id, null) location
    ), '[]'::jsonb)
  )
  from profile;
$$;

create or replace function public.platform_configure_installation_business(
  p_tenant_id text,
  p_owner_user_id uuid,
  p_name text,
  p_public_slug text,
  p_timezone text,
  p_location_name text,
  p_location_address text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.platform_business_profiles%rowtype;
  v_venue public.venues%rowtype;
  v_draft public.platform_experience_configurations%rowtype;
  v_version integer;
begin
  perform 1
  from public.tenants tenant
  where tenant.id = p_tenant_id
  for update;
  if not found then
    raise exception 'installation tenant does not exist';
  end if;

  if not exists (
    select 1
    from public.platform_users platform_user
    where platform_user.id = p_owner_user_id
      and platform_user.tenant_id = p_tenant_id
      and platform_user.role = 'owner'
      and platform_user.status = 'active'
  ) then
    raise exception 'active owner does not belong to tenant';
  end if;

  if trim(p_name) = '' or trim(p_location_name) = '' then
    raise exception 'business and location names are required';
  end if;
  if p_public_slug <> lower(trim(p_public_slug))
     or p_public_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid public slug';
  end if;
  if not exists (select 1 from pg_timezone_names where name = trim(p_timezone)) then
    raise exception 'invalid IANA timezone';
  end if;

  select business.* into v_profile
  from public.platform_business_profiles business
  where business.tenant_id = p_tenant_id
    and business.preset_id = 'appointments_salon'
  order by business.created_at, business.id
  limit 1
  for update;

  if found then
    select venue.* into v_venue
    from public.venues venue
    where venue.tenant_id = p_tenant_id
      and venue.id = v_profile.venue_id
    for update;

    update public.venues
    set name = trim(p_location_name),
        address = nullif(trim(p_location_address), '')
    where id = v_venue.id
    returning * into v_venue;

    update public.platform_business_profiles
    set name = trim(p_name),
        public_slug = p_public_slug,
        preset_id = 'appointments_salon'
    where id = v_profile.id
    returning * into v_profile;
  else
    insert into public.venues (tenant_id, name, address)
    values (p_tenant_id, trim(p_location_name), nullif(trim(p_location_address), ''))
    returning * into v_venue;

    insert into public.platform_business_profiles (
      tenant_id, venue_id, name, public_slug, preset_id, status
    ) values (
      p_tenant_id, v_venue.id, trim(p_name), p_public_slug, 'appointments_salon', 'draft'
    )
    returning * into v_profile;
  end if;

  update public.tenants
  set name = trim(p_name)
  where id = p_tenant_id;

  select configuration.* into v_draft
  from public.platform_experience_configurations configuration
  where configuration.business_id = v_profile.id
    and configuration.state = 'draft'
  for update;

  if found then
    update public.platform_experience_configurations
    set branding = coalesce(v_draft.branding, '{}'::jsonb)
      || jsonb_build_object('brand_name', trim(p_name))
    where id = v_draft.id;
  else
    select coalesce(max(configuration.version), 0) + 1 into v_version
    from public.platform_experience_configurations configuration
    where configuration.business_id = v_profile.id;

    insert into public.platform_experience_configurations (
      business_id, version, state, preset_id, branding, terminology, channels
    ) values (
      v_profile.id,
      v_version,
      'draft',
      'appointments_salon',
      jsonb_build_object('brand_name', trim(p_name)),
      jsonb_build_object(
        'customer', 'Client',
        'resource', 'Practitioner',
        'booking', 'Appointment'
      ),
      jsonb_build_object(
        'web_booking', true,
        'web_chat', false,
        'whatsapp', false
      )
    );
  end if;

  insert into public.platform_availability_settings (
    tenant_id, venue_id, timezone, booking_horizon_days,
    slot_interval_minutes, minimum_notice_minutes
  ) values (
    p_tenant_id, v_venue.id, trim(p_timezone), 60, 30, 0
  )
  on conflict (tenant_id, venue_id) do update
  set timezone = excluded.timezone;

  insert into public.platform_user_venue_assignments (tenant_id, user_id, venue_id)
  values (p_tenant_id, p_owner_user_id, v_venue.id)
  on conflict (user_id, venue_id) do nothing;

  return public.platform_read_installation_business(p_tenant_id);
end;
$$;

create or replace function public.platform_create_installation_location(
  p_tenant_id text,
  p_owner_user_id uuid,
  p_name text,
  p_address text,
  p_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue public.venues%rowtype;
begin
  if not exists (
    select 1 from public.platform_users platform_user
    where platform_user.id = p_owner_user_id
      and platform_user.tenant_id = p_tenant_id
      and platform_user.role = 'owner'
      and platform_user.status = 'active'
  ) then
    raise exception 'active owner does not belong to tenant';
  end if;
  if trim(p_name) = '' then raise exception 'location name is required'; end if;
  if not exists (select 1 from pg_timezone_names where name = trim(p_timezone)) then
    raise exception 'invalid IANA timezone';
  end if;

  insert into public.venues (tenant_id, name, address)
  values (p_tenant_id, trim(p_name), nullif(trim(p_address), ''))
  returning * into v_venue;

  insert into public.platform_availability_settings (
    tenant_id, venue_id, timezone, booking_horizon_days,
    slot_interval_minutes, minimum_notice_minutes
  ) values (p_tenant_id, v_venue.id, trim(p_timezone), 60, 30, 0);

  insert into public.platform_user_venue_assignments (tenant_id, user_id, venue_id)
  values (p_tenant_id, p_owner_user_id, v_venue.id);

  return jsonb_strip_nulls(jsonb_build_object(
    'location_id', v_venue.id,
    'name', v_venue.name,
    'address', v_venue.address,
    'timezone', trim(p_timezone)
  ));
end;
$$;

create or replace function public.platform_update_installation_location(
  p_tenant_id text,
  p_location_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue public.venues%rowtype;
  v_timezone text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'location patch is required';
  end if;

  select venue.* into v_venue
  from public.venues venue
  where venue.tenant_id = p_tenant_id
    and venue.id = p_location_id
  for update;
  if not found then return null; end if;

  v_timezone := case
    when p_patch ? 'timezone' then trim(p_patch->>'timezone')
    else (select settings.timezone from public.platform_availability_settings settings
          where settings.tenant_id = p_tenant_id and settings.venue_id = p_location_id)
  end;
  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    raise exception 'invalid IANA timezone';
  end if;

  update public.venues
  set name = case when p_patch ? 'name' then trim(p_patch->>'name') else v_venue.name end,
      address = case when p_patch ? 'address' then nullif(trim(p_patch->>'address'), '') else v_venue.address end
  where id = p_location_id
  returning * into v_venue;

  insert into public.platform_availability_settings (
    tenant_id, venue_id, timezone, booking_horizon_days,
    slot_interval_minutes, minimum_notice_minutes
  ) values (p_tenant_id, p_location_id, v_timezone, 60, 30, 0)
  on conflict (tenant_id, venue_id) do update
  set timezone = excluded.timezone;

  return jsonb_strip_nulls(jsonb_build_object(
    'location_id', v_venue.id,
    'name', v_venue.name,
    'address', v_venue.address,
    'timezone', v_timezone
  ));
end;
$$;

revoke all on function public.platform_list_installation_locations(text, uuid[]) from public, anon, authenticated;
revoke all on function public.platform_read_installation_business(text) from public, anon, authenticated;
revoke all on function public.platform_configure_installation_business(text, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.platform_create_installation_location(text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.platform_update_installation_location(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.platform_list_installation_locations(text, uuid[]) to service_role;
grant execute on function public.platform_read_installation_business(text) to service_role;
grant execute on function public.platform_configure_installation_business(text, uuid, text, text, text, text, text) to service_role;
grant execute on function public.platform_create_installation_location(text, uuid, text, text, text) to service_role;
grant execute on function public.platform_update_installation_location(text, uuid, jsonb) to service_role;
