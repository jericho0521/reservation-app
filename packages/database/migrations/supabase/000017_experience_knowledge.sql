-- Structured, venue-scoped Experience Studio FAQ knowledge. This remains
-- service-role-only; customer-facing AI receives curated entries through the
-- backend orchestration boundary rather than direct table access.

create table if not exists public.platform_experience_knowledge (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  venue_id uuid not null,
  question text not null check (length(trim(question)) between 1 and 300),
  answer text not null check (length(trim(answer)) between 1 and 4000),
  source text check (source is null or length(source) <= 500),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, venue_id) references public.venues(tenant_id, id) on delete cascade
);

create index if not exists platform_experience_knowledge_scope_status_idx
on public.platform_experience_knowledge (tenant_id, venue_id, status, lower(question), id);

drop trigger if exists set_platform_experience_knowledge_updated_at on public.platform_experience_knowledge;
create trigger set_platform_experience_knowledge_updated_at
before update on public.platform_experience_knowledge
for each row execute function public.set_updated_at();

alter table public.platform_experience_knowledge enable row level security;
revoke all on table public.platform_experience_knowledge from public, anon, authenticated;
grant select, insert, update on table public.platform_experience_knowledge to service_role;
