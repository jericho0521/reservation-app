-- Owner-only staff access administration. Mutations validate the installation
-- tenant and assigned venues inside one transaction, write audit events, and
-- revoke every active session when a staff account is disabled.

alter table public.platform_users
add column activated_at timestamptz;

update public.platform_users
set activated_at = updated_at
where status = 'active'
  and activated_at is null;

create or replace function public.set_platform_user_activated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'active' and new.activated_at is null then
    new.activated_at := now();
  end if;
  return new;
end;
$$;

create trigger set_platform_user_activated_at
before insert or update of status on public.platform_users
for each row execute function public.set_platform_user_activated_at();

revoke execute on function public.platform_create_staff_invitation(text, text, text, text, text, timestamptz, uuid[]) from service_role;
drop function public.platform_create_staff_invitation(text, text, text, text, text, timestamptz, uuid[]);

create or replace function public.platform_create_staff_invitation(
  p_tenant_id text,
  p_actor_user_id uuid,
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

  perform 1
  from public.platform_users as actor
  where actor.id = p_actor_user_id
    and actor.tenant_id = p_tenant_id
    and actor.role = 'owner'
    and actor.status = 'active'
  for share;
  if not found then
    raise exception 'Owner access is required.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct requested.venue_id order by requested.venue_id), array[]::uuid[])
  into normalized_venue_ids
  from unnest(coalesce(p_venue_ids, array[]::uuid[])) as requested(venue_id);

  if cardinality(normalized_venue_ids) = 0 or exists (
    select 1
    from unnest(normalized_venue_ids) as requested(venue_id)
    left join public.venues as venue
      on venue.id = requested.venue_id
     and venue.tenant_id = p_tenant_id
    where venue.id is null
  ) then
    raise exception 'Staff location assignments are invalid.';
  end if;

  insert into public.platform_users (
    tenant_id, email, display_name, password_hash, role, status
  ) values (
    p_tenant_id, normalized_email, trim(p_display_name),
    p_placeholder_password_hash, 'staff', 'invited'
  )
  returning * into created_user;

  insert into public.platform_user_venue_assignments (tenant_id, user_id, venue_id)
  select created_user.tenant_id, created_user.id, requested.venue_id
  from unnest(normalized_venue_ids) as requested(venue_id);

  insert into public.platform_auth_tokens (
    user_id, purpose, token_hash, expires_at
  ) values (
    created_user.id, 'invitation', p_token_hash, p_expires_at
  );

  insert into public.platform_audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_value
  ) values (
    created_user.tenant_id,
    p_actor_user_id,
    'staff.invited',
    'platform_user',
    created_user.id::text,
    jsonb_build_object(
      'email', created_user.email,
      'display_name', created_user.display_name,
      'status', created_user.status,
      'venue_ids', to_jsonb(normalized_venue_ids)
    )
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

create or replace function public.platform_list_staff(p_tenant_id text)
returns table (
  id uuid,
  email text,
  display_name text,
  status text,
  venue_ids uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    staff.id,
    staff.email,
    staff.display_name,
    staff.status,
    coalesce(array_agg(assignment.venue_id order by assignment.venue_id)
      filter (where assignment.venue_id is not null), array[]::uuid[]) as venue_ids
  from public.platform_users as staff
  left join public.platform_user_venue_assignments as assignment
    on assignment.tenant_id = staff.tenant_id
   and assignment.user_id = staff.id
  where staff.tenant_id = p_tenant_id
    and staff.role = 'staff'
  group by staff.id, staff.email, staff.display_name, staff.status
  order by staff.display_name, staff.email, staff.id;
$$;

create or replace function public.platform_update_staff_access(
  p_tenant_id text,
  p_actor_user_id uuid,
  p_user_id uuid,
  p_status text,
  p_venue_ids uuid[],
  p_now timestamptz
)
returns table (
  id uuid,
  email text,
  display_name text,
  status text,
  venue_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user public.platform_users%rowtype;
  updated_user public.platform_users%rowtype;
  previous_venue_ids uuid[];
  normalized_venue_ids uuid[];
begin
  if p_status is not null and p_status not in ('active', 'disabled') then
    raise exception 'Staff account status is invalid.';
  end if;

  perform 1
  from public.platform_users as actor
  where actor.id = p_actor_user_id
    and actor.tenant_id = p_tenant_id
    and actor.role = 'owner'
    and actor.status = 'active'
  for share;
  if not found then
    raise exception 'Owner access is required.' using errcode = '42501';
  end if;

  select candidate.* into target_user
  from public.platform_users as candidate
  where candidate.id = p_user_id
    and candidate.tenant_id = p_tenant_id
    and candidate.role = 'staff'
  for update;
  if not found then
    return;
  end if;

  if p_status = 'active' and target_user.activated_at is null then
    raise exception 'Invited staff must accept their invitation before activation.';
  end if;

  select coalesce(array_agg(assignment.venue_id order by assignment.venue_id), array[]::uuid[])
  into previous_venue_ids
  from public.platform_user_venue_assignments as assignment
  where assignment.tenant_id = p_tenant_id
    and assignment.user_id = target_user.id;

  select coalesce(array_agg(distinct requested.venue_id order by requested.venue_id), array[]::uuid[])
  into normalized_venue_ids
  from unnest(coalesce(p_venue_ids, array[]::uuid[])) as requested(venue_id);

  if cardinality(normalized_venue_ids) = 0 or exists (
    select 1
    from unnest(normalized_venue_ids) as requested(venue_id)
    left join public.venues as venue
      on venue.id = requested.venue_id
     and venue.tenant_id = p_tenant_id
    where venue.id is null
  ) then
    raise exception 'Staff location assignments are invalid.';
  end if;

  delete from public.platform_user_venue_assignments
  where tenant_id = p_tenant_id
    and user_id = target_user.id;

  insert into public.platform_user_venue_assignments (tenant_id, user_id, venue_id)
  select p_tenant_id, target_user.id, requested.venue_id
  from unnest(normalized_venue_ids) as requested(venue_id);

  update public.platform_users
  set status = coalesce(p_status, target_user.status),
      updated_at = p_now
  where platform_users.id = target_user.id
    and platform_users.tenant_id = p_tenant_id
  returning * into updated_user;

  if updated_user.status = 'disabled' then
    update public.platform_sessions
    set revoked_at = p_now
    where user_id = updated_user.id
      and revoked_at is null;

    if target_user.status = 'invited' then
      update public.platform_auth_tokens
      set consumed_at = p_now
      where user_id = updated_user.id
        and purpose = 'invitation'
        and consumed_at is null;
    end if;
  end if;

  insert into public.platform_audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_value, after_value
  ) values (
    p_tenant_id,
    p_actor_user_id,
    'staff.access.updated',
    'platform_user',
    updated_user.id::text,
    jsonb_build_object('status', target_user.status, 'venue_ids', to_jsonb(previous_venue_ids)),
    jsonb_build_object('status', updated_user.status, 'venue_ids', to_jsonb(normalized_venue_ids))
  );

  return query select
    updated_user.id,
    updated_user.email,
    updated_user.display_name,
    updated_user.status,
    normalized_venue_ids;
end;
$$;

revoke all on function public.platform_create_staff_invitation(text, uuid, text, text, text, text, timestamptz, uuid[]) from public, anon, authenticated;
revoke all on function public.platform_list_staff(text) from public, anon, authenticated;
revoke all on function public.platform_update_staff_access(text, uuid, uuid, text, uuid[], timestamptz) from public, anon, authenticated;

grant execute on function public.platform_create_staff_invitation(text, uuid, text, text, text, text, timestamptz, uuid[]) to service_role;
grant execute on function public.platform_list_staff(text) to service_role;
grant execute on function public.platform_update_staff_access(text, uuid, uuid, text, uuid[], timestamptz) to service_role;
