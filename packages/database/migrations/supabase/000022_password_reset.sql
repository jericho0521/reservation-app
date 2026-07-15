-- Atomic, single-use password-reset token creation and completion. These
-- capabilities remain service-role only behind the platform API.

create or replace function public.platform_create_password_reset(
  p_tenant_id text,
  p_email text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table (created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user public.platform_users%rowtype;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_expires_at <= now() then
    return query select false;
    return;
  end if;

  select candidate.* into target_user
  from public.platform_users as candidate
  where candidate.tenant_id = p_tenant_id
    and lower(candidate.email) = lower(trim(p_email))
    and candidate.status = 'active'
  for update;

  if not found then
    return query select false;
    return;
  end if;

  update public.platform_auth_tokens
  set consumed_at = now()
  where user_id = target_user.id
    and purpose = 'password_reset'
    and consumed_at is null;

  insert into public.platform_auth_tokens (
    user_id, purpose, token_hash, expires_at
  ) values (
    target_user.id, 'password_reset', p_token_hash, p_expires_at
  );

  return query select true;
end;
$$;

create or replace function public.platform_complete_password_reset(
  p_token_hash text,
  p_now timestamptz,
  p_password_hash text
)
returns table (completed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  reset_token public.platform_auth_tokens%rowtype;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or length(p_password_hash) = 0 then
    return query select false;
    return;
  end if;

  select candidate.* into reset_token
  from public.platform_auth_tokens as candidate
  join public.platform_users as target_user on target_user.id = candidate.user_id
  where candidate.purpose = 'password_reset'
    and candidate.token_hash = p_token_hash
    and candidate.consumed_at is null
    and candidate.expires_at > p_now
    and target_user.status = 'active'
  for update of candidate, target_user;

  if not found then
    return query select false;
    return;
  end if;

  update public.platform_users
  set password_hash = p_password_hash,
      updated_at = p_now
  where id = reset_token.user_id;

  update public.platform_auth_tokens
  set consumed_at = p_now
  where id = reset_token.id;

  update public.platform_sessions
  set revoked_at = p_now
  where user_id = reset_token.user_id
    and revoked_at is null;

  return query select true;
end;
$$;

create or replace function public.platform_create_session(
  p_user_id uuid,
  p_expected_password_hash text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table (created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user public.platform_users%rowtype;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_expires_at <= now() then
    return query select false;
    return;
  end if;

  select candidate.* into target_user
  from public.platform_users as candidate
  where candidate.id = p_user_id
  for update;

  if not found
    or target_user.status <> 'active'
    or target_user.password_hash <> p_expected_password_hash then
    return query select false;
    return;
  end if;

  insert into public.platform_sessions (user_id, token_hash, expires_at)
  values (target_user.id, p_token_hash, p_expires_at);

  return query select true;
end;
$$;

revoke all on function public.platform_create_password_reset(text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.platform_complete_password_reset(text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.platform_create_session(uuid, text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.platform_create_password_reset(text, text, text, timestamptz) to service_role;
grant execute on function public.platform_complete_password_reset(text, timestamptz, text) to service_role;
grant execute on function public.platform_create_session(uuid, text, text, timestamptz) to service_role;
