-- WhatsApp business agent module persistence.
-- Status: package-owned backend module schema for self-hosted WhatsApp QR
-- sessions, business bot configuration, text knowledge, conversation audit,
-- and message logs.

create table if not exists public.platform_whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'session_qr',
  status text not null default 'disconnected',
  encrypted_credentials text,
  qr_code text,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint platform_whatsapp_sessions_provider_check
    check (provider in ('session_qr', 'meta_cloud')),
  constraint platform_whatsapp_sessions_status_check
    check (status in ('disabled', 'disconnected', 'pending_qr', 'connected', 'expired'))
);

create unique index if not exists platform_whatsapp_sessions_singleton_idx
on public.platform_whatsapp_sessions ((true));

create table if not exists public.platform_whatsapp_config (
  id boolean primary key default true,
  business_name text not null default 'Reservation Business',
  default_service_id uuid references public.services(id) on delete set null,
  language text not null default 'en',
  tone text not null default 'friendly_professional',
  fallback_message text not null default 'Please wait while staff checks this for you.',
  booking_confirmation_required boolean not null default true,
  opening_hours text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint platform_whatsapp_config_singleton_check check (id = true)
);

insert into public.platform_whatsapp_config (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.platform_whatsapp_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  tags text[] not null default '{}'::text[],
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_whatsapp_knowledge_title_check check (length(trim(title)) > 0),
  constraint platform_whatsapp_knowledge_content_check check (length(trim(content)) > 0)
);

create index if not exists platform_whatsapp_knowledge_active_idx
on public.platform_whatsapp_knowledge (active, updated_at desc);

create table if not exists public.platform_whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'session_qr',
  customer_id text not null,
  customer_phone text,
  customer_display_name text,
  chat_session_id text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_whatsapp_conversations_provider_check
    check (provider in ('session_qr', 'meta_cloud')),
  constraint platform_whatsapp_conversations_status_check
    check (status in ('active', 'closed')),
  constraint platform_whatsapp_conversations_customer_id_check
    check (length(trim(customer_id)) > 0)
);

create unique index if not exists platform_whatsapp_conversations_customer_idx
on public.platform_whatsapp_conversations (provider, customer_id);

create table if not exists public.platform_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.platform_whatsapp_conversations(id) on delete cascade,
  direction text not null,
  provider_message_id text,
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  constraint platform_whatsapp_messages_direction_check
    check (direction in ('inbound', 'outbound'))
);

create index if not exists platform_whatsapp_messages_conversation_idx
on public.platform_whatsapp_messages (conversation_id, created_at);

alter table public.platform_whatsapp_sessions enable row level security;
alter table public.platform_whatsapp_config enable row level security;
alter table public.platform_whatsapp_knowledge enable row level security;
alter table public.platform_whatsapp_conversations enable row level security;
alter table public.platform_whatsapp_messages enable row level security;

revoke all on public.platform_whatsapp_sessions from public;
revoke all on public.platform_whatsapp_config from public;
revoke all on public.platform_whatsapp_knowledge from public;
revoke all on public.platform_whatsapp_conversations from public;
revoke all on public.platform_whatsapp_messages from public;

grant select, insert, update, delete on public.platform_whatsapp_sessions to service_role;
grant select, insert, update, delete on public.platform_whatsapp_config to service_role;
grant select, insert, update, delete on public.platform_whatsapp_knowledge to service_role;
grant select, insert, update, delete on public.platform_whatsapp_conversations to service_role;
grant select, insert, update, delete on public.platform_whatsapp_messages to service_role;
