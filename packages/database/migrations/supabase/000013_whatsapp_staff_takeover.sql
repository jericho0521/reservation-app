-- WhatsApp staff takeover state.
-- Adds persistent per-conversation automation control for one-business
-- backends using the WhatsApp business agent module.

alter table public.platform_whatsapp_conversations
  add column if not exists automation_status text not null default 'automated',
  add column if not exists automation_paused_at timestamptz,
  add column if not exists automation_paused_by text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_whatsapp_conversations_automation_status_check'
  ) then
    alter table public.platform_whatsapp_conversations
      add constraint platform_whatsapp_conversations_automation_status_check
      check (automation_status in ('automated', 'manual'));
  end if;
end $$;
