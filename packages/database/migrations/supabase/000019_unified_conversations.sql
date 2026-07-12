-- Venue-scoped unified web chat, WhatsApp, and simulation conversations.

create table if not exists public.platform_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  venue_id uuid not null,
  channel text not null check (channel in ('web_chat', 'whatsapp', 'simulation')),
  channel_thread_id text not null check (length(trim(channel_thread_id)) > 0),
  status text not null default 'active' check (status in ('active', 'closed')),
  automation_state text not null default 'automated' check (automation_state in ('automated', 'manual')),
  automation_changed_at timestamptz,
  automation_changed_by text,
  reservation_id uuid references public.bookings(id) on delete set null,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, venue_id) references public.venues(tenant_id, id) on delete cascade,
  unique (tenant_id, venue_id, channel, channel_thread_id)
);

create table if not exists public.platform_conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.platform_conversations(id) on delete cascade,
  role text not null check (role in ('customer', 'staff', 'automation')),
  channel_identifier text,
  identifier_hash text,
  display_name text,
  contact_hint text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, role),
  check (channel_identifier is null or length(trim(channel_identifier)) > 0),
  check (identifier_hash is null or identifier_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.platform_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.platform_conversations(id) on delete cascade,
  channel text not null check (channel in ('web_chat', 'whatsapp', 'simulation')),
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('customer', 'automation', 'staff', 'system')),
  delivery_state text not null default 'sent' check (delivery_state in ('pending', 'sent', 'delivered', 'failed')),
  external_message_id text,
  content text not null check (length(content) between 1 and 4000),
  reservation_id uuid references public.bookings(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists platform_conversation_messages_channel_external_key
on public.platform_conversation_messages (conversation_id, channel, external_message_id)
where external_message_id is not null;

create index if not exists platform_conversations_scope_activity_idx
on public.platform_conversations (tenant_id, venue_id, last_message_at desc nulls last, created_at desc);

create index if not exists platform_conversation_messages_timeline_idx
on public.platform_conversation_messages (conversation_id, created_at desc, id desc);

create or replace function public.append_platform_conversation_message(
  p_tenant_id text,
  p_venue_id uuid,
  p_conversation_id uuid,
  p_channel text,
  p_direction text,
  p_sender_type text,
  p_delivery_state text,
  p_external_message_id text,
  p_content text,
  p_reservation_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.platform_conversation_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.platform_conversation_messages;
begin
  if not exists (
    select 1 from public.platform_conversations
    where id = p_conversation_id
      and tenant_id = p_tenant_id
      and venue_id = p_venue_id
      and channel = p_channel
  ) then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;

  if p_external_message_id is not null then
    select * into v_message
    from public.platform_conversation_messages
    where conversation_id = p_conversation_id
      and channel = p_channel
      and external_message_id = p_external_message_id;
    if found then return v_message; end if;
  end if;

  insert into public.platform_conversation_messages (
    conversation_id, channel, direction, sender_type, delivery_state,
    external_message_id, content, reservation_id, metadata
  ) values (
    p_conversation_id, p_channel, p_direction, p_sender_type, p_delivery_state,
    p_external_message_id, p_content, p_reservation_id, coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_message;

  update public.platform_conversations
  set last_message_at = v_message.created_at,
      reservation_id = coalesce(p_reservation_id, reservation_id)
  where id = p_conversation_id;

  return v_message;
exception
  when unique_violation then
    select * into v_message
    from public.platform_conversation_messages
    where conversation_id = p_conversation_id
      and channel = p_channel
      and external_message_id = p_external_message_id;
    return v_message;
end;
$$;

drop trigger if exists set_platform_conversations_updated_at on public.platform_conversations;
create trigger set_platform_conversations_updated_at before update on public.platform_conversations
for each row execute function public.set_updated_at();

drop trigger if exists set_platform_conversation_participants_updated_at on public.platform_conversation_participants;
create trigger set_platform_conversation_participants_updated_at before update on public.platform_conversation_participants
for each row execute function public.set_updated_at();

alter table public.platform_conversations enable row level security;
alter table public.platform_conversation_participants enable row level security;
alter table public.platform_conversation_messages enable row level security;

revoke all on table public.platform_conversations from public, anon, authenticated;
revoke all on table public.platform_conversation_participants from public, anon, authenticated;
revoke all on table public.platform_conversation_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_conversations to service_role;
grant select, insert, update, delete on table public.platform_conversation_participants to service_role;
grant select, insert, update, delete on table public.platform_conversation_messages to service_role;

revoke all on function public.append_platform_conversation_message(text, uuid, uuid, text, text, text, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.append_platform_conversation_message(text, uuid, uuid, text, text, text, text, text, text, uuid, jsonb) to service_role;
