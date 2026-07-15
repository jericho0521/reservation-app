-- Durable conversational booking proposals and worker-owned channel runtime state.

create table public.platform_conversation_booking_proposals (
  tenant_id text not null references public.tenants(id) on delete cascade,
  venue_id uuid not null,
  conversation_id uuid not null references public.platform_conversations(id) on delete cascade,
  proposal_id text not null check (length(trim(proposal_id)) between 1 and 255),
  booking jsonb not null check (jsonb_typeof(booking) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'confirming', 'confirmed', 'expired')),
  reservation_id uuid references public.bookings(id) on delete set null,
  reservation jsonb check (reservation is null or jsonb_typeof(reservation) = 'object'),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, venue_id, proposal_id),
  foreign key (tenant_id, venue_id) references public.venues(tenant_id, id) on delete cascade,
  check ((status = 'confirming') = (claimed_at is not null)),
  check ((status = 'confirmed') = (reservation_id is not null and reservation is not null))
);

create index platform_conversation_booking_proposals_conversation_idx
on public.platform_conversation_booking_proposals (tenant_id, venue_id, conversation_id, created_at desc);

create index platform_conversation_booking_proposals_expiry_idx
on public.platform_conversation_booking_proposals (expires_at)
where status in ('pending', 'confirming');

create trigger platform_conversation_booking_proposals_updated_at
before update on public.platform_conversation_booking_proposals
for each row execute function public.set_updated_at();

create or replace function public.platform_validate_conversation_proposal_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.platform_conversations as conversation
    where conversation.id = new.conversation_id
      and conversation.tenant_id = new.tenant_id
      and conversation.venue_id = new.venue_id
  ) then
    raise exception 'Conversation proposal is outside its tenant or venue.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger platform_conversation_booking_proposals_validate_scope
before insert or update of tenant_id, venue_id, conversation_id
on public.platform_conversation_booking_proposals
for each row execute function public.platform_validate_conversation_proposal_scope();

create or replace function public.save_platform_conversation_booking_proposal(
  p_tenant_id text,
  p_venue_id uuid,
  p_conversation_id uuid,
  p_proposal_id text,
  p_booking jsonb,
  p_expires_at timestamptz
)
returns public.platform_conversation_booking_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.platform_conversation_booking_proposals;
begin
  insert into public.platform_conversation_booking_proposals (
    tenant_id, venue_id, conversation_id, proposal_id, booking, expires_at
  ) values (
    p_tenant_id, p_venue_id, p_conversation_id, trim(p_proposal_id), p_booking, p_expires_at
  )
  on conflict (tenant_id, venue_id, proposal_id) do update
    set booking = excluded.booking,
        expires_at = excluded.expires_at
    where platform_conversation_booking_proposals.status = 'pending'
      and platform_conversation_booking_proposals.conversation_id = excluded.conversation_id
  returning * into v_proposal;

  if v_proposal is null then
    select * into v_proposal
    from public.platform_conversation_booking_proposals
    where tenant_id = p_tenant_id
      and venue_id = p_venue_id
      and proposal_id = trim(p_proposal_id);
  end if;
  return v_proposal;
end;
$$;

create or replace function public.load_platform_conversation_booking_proposal(
  p_tenant_id text,
  p_venue_id uuid,
  p_proposal_id text
)
returns public.platform_conversation_booking_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.platform_conversation_booking_proposals;
begin
  update public.platform_conversation_booking_proposals
  set status = 'expired', claimed_at = null
  where tenant_id = p_tenant_id
    and venue_id = p_venue_id
    and proposal_id = trim(p_proposal_id)
    and status in ('pending', 'confirming')
    and expires_at <= now();

  select * into v_proposal
  from public.platform_conversation_booking_proposals
  where tenant_id = p_tenant_id
    and venue_id = p_venue_id
    and proposal_id = trim(p_proposal_id)
    and status <> 'expired';
  return v_proposal;
end;
$$;

create or replace function public.claim_platform_conversation_booking_proposal(
  p_tenant_id text,
  p_venue_id uuid,
  p_proposal_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.platform_conversation_booking_proposals;
begin
  select * into v_proposal
  from public.platform_conversation_booking_proposals
  where tenant_id = p_tenant_id
    and venue_id = p_venue_id
    and proposal_id = trim(p_proposal_id)
  for update;

  if not found then return null; end if;
  if v_proposal.status = 'confirmed' then
    return jsonb_build_object('outcome', 'confirmed', 'reservation', v_proposal.reservation);
  end if;
  if v_proposal.status = 'expired' or v_proposal.expires_at <= now() then
    update public.platform_conversation_booking_proposals
    set status = 'expired', claimed_at = null
    where tenant_id = p_tenant_id and venue_id = p_venue_id and proposal_id = trim(p_proposal_id);
    return jsonb_build_object('outcome', 'expired');
  end if;
  if v_proposal.status = 'confirming' then
    return jsonb_build_object('outcome', 'in_progress');
  end if;

  update public.platform_conversation_booking_proposals
  set status = 'confirming', claimed_at = now()
  where tenant_id = p_tenant_id and venue_id = p_venue_id and proposal_id = trim(p_proposal_id);
  return jsonb_build_object('outcome', 'claimed');
end;
$$;

create or replace function public.load_latest_platform_conversation_booking_proposal(
  p_tenant_id text,
  p_venue_id uuid,
  p_conversation_id uuid
)
returns public.platform_conversation_booking_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.platform_conversation_booking_proposals;
begin
  update public.platform_conversation_booking_proposals
  set status = 'expired', claimed_at = null
  where tenant_id = p_tenant_id
    and venue_id = p_venue_id
    and conversation_id = p_conversation_id
    and status in ('pending', 'confirming')
    and expires_at <= now();

  select * into v_proposal
  from public.platform_conversation_booking_proposals
  where tenant_id = p_tenant_id
    and venue_id = p_venue_id
    and conversation_id = p_conversation_id
    and status in ('pending', 'confirming')
    and expires_at > now()
  order by created_at desc
  limit 1;
  return v_proposal;
end;
$$;

create or replace function public.release_platform_conversation_booking_proposal(
  p_tenant_id text,
  p_venue_id uuid,
  p_proposal_id text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with released as (
    update public.platform_conversation_booking_proposals
    set status = case when expires_at <= now() then 'expired' else 'pending' end,
        claimed_at = null
    where tenant_id = p_tenant_id
      and venue_id = p_venue_id
      and proposal_id = trim(p_proposal_id)
      and status = 'confirming'
    returning 1
  )
  select exists(select 1 from released);
$$;

create or replace function public.complete_platform_conversation_booking_proposal(
  p_tenant_id text,
  p_venue_id uuid,
  p_proposal_id text,
  p_reservation_id uuid,
  p_reservation jsonb
)
returns public.platform_conversation_booking_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.platform_conversation_booking_proposals;
begin
  select * into v_proposal
  from public.platform_conversation_booking_proposals
  where tenant_id = p_tenant_id
    and venue_id = p_venue_id
    and proposal_id = trim(p_proposal_id)
  for update;

  if not found then raise exception 'Conversation proposal not found.' using errcode = 'P0002'; end if;
  if v_proposal.status = 'confirmed' then
    if v_proposal.reservation_id <> p_reservation_id then
      raise exception 'Conversation proposal was completed with a different reservation.' using errcode = '23505';
    end if;
    return v_proposal;
  end if;
  if v_proposal.status <> 'confirming' then
    raise exception 'Conversation proposal is not claimed.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.bookings as booking
    join public.services as service on service.id = booking.service_id
    join public.venues as venue on venue.id = service.venue_id
    where booking.id = p_reservation_id
      and venue.id = p_venue_id
      and venue.tenant_id = p_tenant_id
  ) then
    raise exception 'Conversation proposal reservation is outside its tenant or venue.' using errcode = '23514';
  end if;

  update public.platform_conversation_booking_proposals
  set status = 'confirmed', reservation_id = p_reservation_id,
      reservation = p_reservation, claimed_at = null
  where tenant_id = p_tenant_id and venue_id = p_venue_id and proposal_id = trim(p_proposal_id)
  returning * into v_proposal;
  return v_proposal;
end;
$$;

create table public.platform_channel_commands (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('whatsapp.start_session', 'whatsapp.restore_session', 'whatsapp.logout_session')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 255),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index platform_channel_commands_pending_idx
on public.platform_channel_commands (created_at)
where status = 'pending';

create trigger platform_channel_commands_updated_at before update on public.platform_channel_commands
for each row execute function public.set_updated_at();

create table public.platform_channel_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  venue_id uuid not null,
  conversation_id uuid not null references public.platform_conversations(id) on delete cascade,
  message_id uuid not null unique references public.platform_conversation_messages(id) on delete cascade,
  channel text not null check (channel in ('web_chat', 'whatsapp', 'simulation')),
  target text not null check (length(trim(target)) between 1 and 512),
  content text not null check (length(content) between 1 and 4000),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  provider_message_id text,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 255),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, venue_id) references public.venues(tenant_id, id) on delete cascade
);

create index platform_channel_outbox_delivery_idx
on public.platform_channel_outbox (available_at, created_at)
where status in ('pending', 'failed');

create trigger platform_channel_outbox_updated_at before update on public.platform_channel_outbox
for each row execute function public.set_updated_at();

create trigger platform_channel_outbox_validate_scope
before insert or update of tenant_id, venue_id, conversation_id
on public.platform_channel_outbox
for each row execute function public.platform_validate_conversation_proposal_scope();

create table public.platform_whatsapp_pairing_state (
  tenant_id text primary key references public.tenants(id) on delete cascade,
  encrypted_qr jsonb not null check (
    jsonb_typeof(encrypted_qr) = 'object'
    and encrypted_qr->>'v' = '1'
    and encrypted_qr->>'alg' = 'aes-256-gcm'
    and length(encrypted_qr->>'iv') > 0
    and length(encrypted_qr->>'tag') > 0
    and length(encrypted_qr->>'ciphertext') > 0
  ),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create trigger platform_whatsapp_pairing_state_updated_at before update on public.platform_whatsapp_pairing_state
for each row execute function public.set_updated_at();

create or replace function public.platform_claim_whatsapp_outbox(p_outbox_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outbox public.platform_channel_outbox;
begin
  update public.platform_channel_outbox
  set status = 'sending', attempts = attempts + 1, last_error_code = null
  where id = p_outbox_id
    and status in ('pending', 'failed')
  returning * into v_outbox;

  if v_outbox.id is null then return null; end if;
  return jsonb_build_object(
    'outbox_id', v_outbox.id,
    'message_id', v_outbox.message_id,
    'target', v_outbox.target,
    'content', v_outbox.content
  );
end;
$$;

create or replace function public.platform_complete_whatsapp_outbox(
  p_outbox_id uuid,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message_id uuid;
begin
  update public.platform_channel_outbox
  set status = 'sent',
      provider_message_id = nullif(trim(p_provider_message_id), ''),
      sent_at = now(),
      last_error_code = null
  where id = p_outbox_id and status = 'sending'
  returning message_id into v_message_id;

  if v_message_id is null then return false; end if;
  update public.platform_conversation_messages set delivery_state = 'sent' where id = v_message_id;
  return true;
end;
$$;

create or replace function public.platform_release_whatsapp_outbox(
  p_outbox_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message_id uuid;
begin
  update public.platform_channel_outbox
  set status = 'failed',
      last_error_code = p_error_code,
      available_at = now() + interval '15 seconds'
  where id = p_outbox_id and status = 'sending'
  returning message_id into v_message_id;

  if v_message_id is null then return false; end if;
  update public.platform_conversation_messages set delivery_state = 'failed' where id = v_message_id;
  return true;
end;
$$;

create or replace function public.platform_enqueue_whatsapp_command(
  p_tenant_id text,
  p_venue_id uuid,
  p_kind text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_command_id uuid;
  v_job_id uuid;
begin
  if p_kind not in ('whatsapp.start_session', 'whatsapp.restore_session', 'whatsapp.logout_session') then
    raise exception 'Unsupported WhatsApp command.' using errcode = '22023';
  end if;

  insert into public.platform_channel_commands (tenant_id, kind, payload, idempotency_key)
  values (
    p_tenant_id,
    p_kind,
    jsonb_strip_nulls(jsonb_build_object('venueId', p_venue_id)),
    trim(p_idempotency_key)
  )
  on conflict (tenant_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into v_command_id;

  insert into public.platform_jobs (
    tenant_id, venue_id, kind, payload, max_attempts, idempotency_key
  ) values (
    p_tenant_id,
    p_venue_id,
    p_kind,
    jsonb_build_object('commandId', v_command_id),
    5,
    'channel-command:' || v_command_id::text
  )
  on conflict (tenant_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into v_job_id;

  if p_kind = 'whatsapp.logout_session' then
    delete from public.platform_whatsapp_pairing_state where tenant_id = p_tenant_id;
  end if;

  return jsonb_build_object('command_id', v_command_id, 'job_id', v_job_id, 'status', 'pending');
end;
$$;

create or replace function public.platform_mark_whatsapp_command(
  p_command_id uuid,
  p_status text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('processing', 'completed', 'failed') then
    raise exception 'Unsupported WhatsApp command status.' using errcode = '22023';
  end if;
  update public.platform_channel_commands
  set status = p_status,
      started_at = case when p_status = 'processing' then coalesce(started_at, now()) else started_at end,
      completed_at = case when p_status = 'completed' then now() else null end,
      failed_at = case when p_status = 'failed' then now() else null end,
      error_code = case when p_status = 'failed' then p_error_code else null end
  where id = p_command_id;
  return found;
end;
$$;

create or replace function public.platform_read_whatsapp_channel_state(p_tenant_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.platform_whatsapp_sessions;
  v_command public.platform_channel_commands;
begin
  select * into v_session
  from public.platform_whatsapp_sessions
  where metadata->>'tenant_id' = p_tenant_id
  order by updated_at desc
  limit 1;

  select * into v_command
  from public.platform_channel_commands
  where tenant_id = p_tenant_id
  order by created_at desc
  limit 1;

  if v_session.id is null then
    return jsonb_build_object(
      'provider', 'session_qr',
      'status', case
        when v_command.kind = 'whatsapp.start_session' and v_command.status in ('pending', 'processing') then 'pending_qr'
        else 'disconnected'
      end,
      'updated_at', coalesce(v_command.updated_at, now()),
      'metadata', jsonb_strip_nulls(jsonb_build_object(
        'command_id', v_command.id,
        'command_status', v_command.status,
        'error_code', v_command.error_code
      ))
    );
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'provider', v_session.provider,
    'status', v_session.status,
    'session_id', v_session.id,
    'connected_at', v_session.connected_at,
    'updated_at', v_session.updated_at,
    'metadata', coalesce(v_session.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'command_id', v_command.id,
      'command_status', v_command.status,
      'error_code', v_command.error_code
    ))
  ));
end;
$$;

create or replace function public.platform_read_whatsapp_pairing_state(p_tenant_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pairing public.platform_whatsapp_pairing_state;
begin
  delete from public.platform_whatsapp_pairing_state
  where tenant_id = p_tenant_id and expires_at <= now();
  select * into v_pairing
  from public.platform_whatsapp_pairing_state
  where tenant_id = p_tenant_id;
  if v_pairing.tenant_id is null then return null; end if;
  return jsonb_build_object('encrypted_qr', v_pairing.encrypted_qr, 'expires_at', v_pairing.expires_at);
end;
$$;

create or replace function public.platform_append_whatsapp_staff_reply(
  p_tenant_id text,
  p_venue_id uuid,
  p_conversation_id uuid,
  p_content text,
  p_changed_by text
)
returns public.platform_conversation_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.platform_conversations;
  v_message public.platform_conversation_messages;
  v_target text;
  v_outbox_id uuid;
begin
  select * into v_conversation
  from public.platform_conversations
  where id = p_conversation_id
    and tenant_id = p_tenant_id
    and venue_id = p_venue_id
    and channel = 'whatsapp'
  for update;
  if not found then raise exception 'WhatsApp conversation not found.' using errcode = 'P0002'; end if;

  select channel_identifier into v_target
  from public.platform_conversation_participants
  where conversation_id = p_conversation_id and role = 'customer';
  if nullif(trim(v_target), '') is null then
    raise exception 'WhatsApp delivery target is unavailable.' using errcode = 'P0002';
  end if;

  update public.platform_conversations
  set automation_state = 'manual', automation_changed_at = now(),
      automation_changed_by = coalesce(nullif(trim(p_changed_by), ''), 'staff')
  where id = p_conversation_id;

  insert into public.platform_conversation_messages (
    conversation_id, channel, direction, sender_type, delivery_state, content, metadata
  ) values (
    p_conversation_id, 'whatsapp', 'outbound', 'staff', 'pending', p_content,
    jsonb_build_object('event', 'staff.reply')
  ) returning * into v_message;

  update public.platform_conversations set last_message_at = v_message.created_at where id = p_conversation_id;

  insert into public.platform_channel_outbox (
    tenant_id, venue_id, conversation_id, message_id, channel, target, content, idempotency_key
  ) values (
    p_tenant_id, p_venue_id, p_conversation_id, v_message.id, 'whatsapp', v_target, p_content,
    'staff-reply:' || v_message.id::text
  ) returning id into v_outbox_id;

  insert into public.platform_jobs (
    tenant_id, venue_id, kind, payload, max_attempts, idempotency_key
  ) values (
    p_tenant_id, p_venue_id, 'whatsapp.deliver_outbound', jsonb_build_object('outboxId', v_outbox_id), 5,
    'whatsapp-outbox:' || v_outbox_id::text
  );

  return v_message;
end;
$$;

create or replace function public.platform_append_whatsapp_automation_reply(
  p_tenant_id text,
  p_venue_id uuid,
  p_conversation_id uuid,
  p_external_message_id text,
  p_content text,
  p_metadata jsonb
)
returns public.platform_conversation_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.platform_conversation_messages;
  v_target text;
  v_outbox_id uuid;
begin
  if not exists (
    select 1 from public.platform_conversations
    where id = p_conversation_id and tenant_id = p_tenant_id
      and venue_id = p_venue_id and channel = 'whatsapp'
  ) then raise exception 'WhatsApp conversation not found.' using errcode = 'P0002'; end if;

  select channel_identifier into v_target
  from public.platform_conversation_participants
  where conversation_id = p_conversation_id and role = 'customer';
  if nullif(trim(v_target), '') is null then
    raise exception 'WhatsApp delivery target is unavailable.' using errcode = 'P0002';
  end if;

  v_message := public.append_platform_conversation_message(
    p_tenant_id, p_venue_id, p_conversation_id, 'whatsapp', 'outbound', 'automation',
    'pending', p_external_message_id, p_content, null, coalesce(p_metadata, '{}'::jsonb)
  );

  insert into public.platform_channel_outbox (
    tenant_id, venue_id, conversation_id, message_id, channel, target, content, idempotency_key
  ) values (
    p_tenant_id, p_venue_id, p_conversation_id, v_message.id, 'whatsapp', v_target, p_content,
    'automation-reply:' || v_message.id::text
  )
  on conflict (tenant_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into v_outbox_id;

  insert into public.platform_jobs (
    tenant_id, venue_id, kind, payload, max_attempts, idempotency_key
  ) values (
    p_tenant_id, p_venue_id, 'whatsapp.deliver_outbound', jsonb_build_object('outboxId', v_outbox_id), 5,
    'whatsapp-outbox:' || v_outbox_id::text
  )
  on conflict (tenant_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key;

  return v_message;
end;
$$;

alter table public.platform_conversation_booking_proposals enable row level security;
alter table public.platform_channel_commands enable row level security;
alter table public.platform_channel_outbox enable row level security;
alter table public.platform_whatsapp_pairing_state enable row level security;

revoke all on table public.platform_conversation_booking_proposals from public, anon, authenticated, service_role;
revoke all on table public.platform_channel_commands from public, anon, authenticated, service_role;
revoke all on table public.platform_channel_outbox from public, anon, authenticated, service_role;
revoke all on table public.platform_whatsapp_pairing_state from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.platform_conversation_booking_proposals to service_role;
grant select, insert, update, delete on table public.platform_channel_commands to service_role;
grant select, insert, update, delete on table public.platform_channel_outbox to service_role;
grant select, insert, update, delete on table public.platform_whatsapp_pairing_state to service_role;

revoke all on function public.platform_enqueue_whatsapp_command(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.platform_mark_whatsapp_command(uuid, text, text) from public, anon, authenticated;
revoke all on function public.platform_read_whatsapp_channel_state(text) from public, anon, authenticated;
revoke all on function public.platform_read_whatsapp_pairing_state(text) from public, anon, authenticated;
revoke all on function public.platform_append_whatsapp_staff_reply(text, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.platform_append_whatsapp_automation_reply(text, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.platform_claim_whatsapp_outbox(uuid) from public, anon, authenticated;
revoke all on function public.platform_complete_whatsapp_outbox(uuid, text) from public, anon, authenticated;
revoke all on function public.platform_release_whatsapp_outbox(uuid, text) from public, anon, authenticated;
grant execute on function public.platform_enqueue_whatsapp_command(text, uuid, text, text) to service_role;
grant execute on function public.platform_mark_whatsapp_command(uuid, text, text) to service_role;
grant execute on function public.platform_read_whatsapp_channel_state(text) to service_role;
grant execute on function public.platform_read_whatsapp_pairing_state(text) to service_role;
grant execute on function public.platform_append_whatsapp_staff_reply(text, uuid, uuid, text, text) to service_role;
grant execute on function public.platform_append_whatsapp_automation_reply(text, uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.platform_claim_whatsapp_outbox(uuid) to service_role;
grant execute on function public.platform_complete_whatsapp_outbox(uuid, text) to service_role;
grant execute on function public.platform_release_whatsapp_outbox(uuid, text) to service_role;

revoke all on function public.save_platform_conversation_booking_proposal(text, uuid, uuid, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.load_platform_conversation_booking_proposal(text, uuid, text) from public, anon, authenticated;
revoke all on function public.load_latest_platform_conversation_booking_proposal(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_platform_conversation_booking_proposal(text, uuid, text) from public, anon, authenticated;
revoke all on function public.release_platform_conversation_booking_proposal(text, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_platform_conversation_booking_proposal(text, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_platform_conversation_booking_proposal(text, uuid, uuid, text, jsonb, timestamptz) to service_role;
grant execute on function public.load_platform_conversation_booking_proposal(text, uuid, text) to service_role;
grant execute on function public.load_latest_platform_conversation_booking_proposal(text, uuid, uuid) to service_role;
grant execute on function public.claim_platform_conversation_booking_proposal(text, uuid, text) to service_role;
grant execute on function public.release_platform_conversation_booking_proposal(text, uuid, text) to service_role;
grant execute on function public.complete_platform_conversation_booking_proposal(text, uuid, text, uuid, jsonb) to service_role;
