-- Reservation platform database bundle artifact.
-- Source: supabase/base-schema.sql
-- Section: service_availability_rules schema, constraints, indexes, and
-- triggers.
-- Status: package-owned runnable migration asset; live database proof is still
-- pending.

create table if not exists public.service_availability_rules (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  rule_kind text not null default 'operating_window' check (rule_kind in ('operating_window', 'blackout')),
  day_of_week integer check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_duration_minutes integer not null default 60 check (slot_duration_minutes > 0),
  interval_minutes integer not null default 60 check (interval_minutes > 0),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_availability_rules_service_active_idx
on public.service_availability_rules (service_id, is_active, day_of_week);

drop trigger if exists set_service_availability_rules_updated_at on public.service_availability_rules;
create trigger set_service_availability_rules_updated_at
before update on public.service_availability_rules
for each row execute function public.set_updated_at();
