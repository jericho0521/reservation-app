-- Generic per-installation integration settings and encrypted credentials.
-- Credential envelopes are opaque to PostgreSQL and direct access remains
-- restricted to the backend service role.

create table public.platform_integration_settings (
  tenant_id text not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('email', 'ai', 'whatsapp')),
  enabled boolean not null default false,
  provider text not null check (
    provider = lower(provider)
    and provider ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  public_config jsonb not null default '{}'::jsonb check (jsonb_typeof(public_config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, kind)
);

create table public.platform_integration_credentials (
  tenant_id text not null,
  kind text not null,
  envelope jsonb not null check (
    jsonb_typeof(envelope) = 'object'
    and envelope->>'v' = '1'
    and envelope->>'alg' = 'aes-256-gcm'
    and jsonb_typeof(envelope->'iv') = 'string'
    and jsonb_typeof(envelope->'tag') = 'string'
    and jsonb_typeof(envelope->'ciphertext') = 'string'
    and envelope->>'iv' ~ '^[A-Za-z0-9_-]{16}$'
    and envelope->>'tag' ~ '^[A-Za-z0-9_-]{22}$'
    and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$'
    and envelope - array['v', 'alg', 'iv', 'tag', 'ciphertext'] = '{}'::jsonb
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, kind),
  foreign key (tenant_id, kind)
    references public.platform_integration_settings (tenant_id, kind) on delete cascade
);

create or replace function public.platform_touch_integration_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger platform_integration_settings_updated_at
before update on public.platform_integration_settings
for each row execute function public.platform_touch_integration_updated_at();

create trigger platform_integration_credentials_updated_at
before update on public.platform_integration_credentials
for each row execute function public.platform_touch_integration_updated_at();

alter table public.platform_integration_settings enable row level security;
alter table public.platform_integration_credentials enable row level security;

revoke all on table public.platform_integration_settings from public, anon, authenticated, service_role;
revoke all on table public.platform_integration_credentials from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.platform_integration_settings to service_role;
grant select, insert, update, delete on table public.platform_integration_credentials to service_role;

create or replace function public.platform_save_integration_settings(
  p_tenant_id text,
  p_actor_user_id uuid,
  p_kind text,
  p_enabled boolean,
  p_provider text,
  p_public_config jsonb,
  p_envelope jsonb default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  saved public.platform_integration_settings%rowtype;
  credential_present boolean;
begin
  if not exists (
    select 1
    from public.platform_users actor
    where actor.tenant_id = p_tenant_id
      and actor.id = p_actor_user_id
      and actor.role = 'owner'
      and actor.status = 'active'
  ) then
    raise exception 'An active owner is required.' using errcode = '42501';
  end if;

  if p_public_config is null or jsonb_typeof(p_public_config) <> 'object' then
    raise exception 'Public integration configuration is invalid.' using errcode = '22023';
  end if;

  if not (
    (p_kind = 'email' and p_provider = 'smtp'
      and p_public_config - array['host', 'port', 'tls_mode', 'from_address', 'from_name'] = '{}'::jsonb)
    or (p_kind = 'ai' and p_provider in ('openai', 'openai-compatible')
      and p_public_config - array['model', 'base_url', 'max_output_tokens'] = '{}'::jsonb)
    or (p_kind = 'whatsapp' and p_provider = 'baileys'
      and p_public_config - array['display_name', 'phone_number'] = '{}'::jsonb)
  ) then
    raise exception 'Integration provider or public configuration is invalid.' using errcode = '22023';
  end if;

  insert into public.platform_integration_settings (
    tenant_id, kind, enabled, provider, public_config
  ) values (
    p_tenant_id, p_kind, p_enabled, p_provider, p_public_config
  )
  on conflict (tenant_id, kind) do update set
    enabled = excluded.enabled,
    provider = excluded.provider,
    public_config = excluded.public_config
  returning * into saved;

  if p_envelope is not null then
    insert into public.platform_integration_credentials (tenant_id, kind, envelope)
    values (p_tenant_id, p_kind, p_envelope)
    on conflict (tenant_id, kind) do update set envelope = excluded.envelope;
  end if;

  select exists (
    select 1 from public.platform_integration_credentials credential
    where credential.tenant_id = p_tenant_id and credential.kind = p_kind
  ) into credential_present;

  insert into public.platform_audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_value
  ) values (
    p_tenant_id,
    p_actor_user_id,
    case when p_envelope is null then 'integration.settings_saved' else 'integration.credential_rotated' end,
    'integration_settings',
    p_kind,
    jsonb_build_object(
      'kind', p_kind,
      'enabled', p_enabled,
      'provider', p_provider,
      'credential_present', credential_present
    )
  );

  return jsonb_build_object(
    'tenant_id', saved.tenant_id,
    'kind', saved.kind,
    'enabled', saved.enabled,
    'provider', saved.provider,
    'public_config', saved.public_config,
    'updated_at', saved.updated_at,
    'credential_present', credential_present
  );
end;
$$;

create or replace function public.platform_rotate_integration_credential(
  p_tenant_id text,
  p_actor_user_id uuid,
  p_kind text,
  p_envelope jsonb
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.platform_users actor
    join public.platform_integration_settings settings
      on settings.tenant_id = actor.tenant_id and settings.kind = p_kind
    where actor.tenant_id = p_tenant_id
      and actor.id = p_actor_user_id
      and actor.role = 'owner'
      and actor.status = 'active'
  ) then
    raise exception 'An active owner and integration settings are required.' using errcode = '42501';
  end if;

  insert into public.platform_integration_credentials (tenant_id, kind, envelope)
  values (p_tenant_id, p_kind, p_envelope)
  on conflict (tenant_id, kind) do update set envelope = excluded.envelope;

  insert into public.platform_audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_value
  ) values (
    p_tenant_id,
    p_actor_user_id,
    'integration.credential_rotated',
    'integration_settings',
    p_kind,
    jsonb_build_object('kind', p_kind, 'credential_present', true)
  );
end;
$$;

create or replace function public.platform_delete_integration_credential(
  p_tenant_id text,
  p_actor_user_id uuid,
  p_kind text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.platform_users actor
    where actor.tenant_id = p_tenant_id
      and actor.id = p_actor_user_id
      and actor.role = 'owner'
      and actor.status = 'active'
  ) then
    raise exception 'An active owner is required.' using errcode = '42501';
  end if;

  delete from public.platform_integration_credentials
  where tenant_id = p_tenant_id and kind = p_kind;

  insert into public.platform_audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_value
  ) values (
    p_tenant_id,
    p_actor_user_id,
    'integration.credential_deleted',
    'integration_settings',
    p_kind,
    jsonb_build_object('kind', p_kind, 'credential_present', false)
  );
end;
$$;

revoke all on function public.platform_save_integration_settings(text, uuid, text, boolean, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.platform_rotate_integration_credential(text, uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.platform_delete_integration_credential(text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.platform_save_integration_settings(text, uuid, text, boolean, text, jsonb, jsonb)
  to service_role;
grant execute on function public.platform_rotate_integration_credential(text, uuid, text, jsonb)
  to service_role;
grant execute on function public.platform_delete_integration_credential(text, uuid, text)
  to service_role;
