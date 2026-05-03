-- LangGraph checkpoint tables for conversation persistence.
-- Run this in the Supabase SQL editor before deploying.

create table if not exists public.checkpoints (
  thread_id text not null,
  checkpoint_ns text not null default '',
  checkpoint_id text not null,
  parent_checkpoint_id text,
  type text,
  checkpoint jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  primary key (thread_id, checkpoint_ns, checkpoint_id)
);

create table if not exists public.checkpoint_writes (
  thread_id text not null,
  checkpoint_ns text not null default '',
  checkpoint_id text not null,
  task_id text not null,
  idx integer not null,
  channel text not null,
  type text,
  value bytea,
  primary key (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

create table if not exists public.checkpoint_blobs (
  thread_id text not null,
  checkpoint_ns text not null default '',
  channel text not null,
  version text not null,
  type text not null,
  blob bytea,
  primary key (thread_id, checkpoint_ns, channel, version)
);

alter table public.checkpoints enable row level security;
alter table public.checkpoint_writes enable row level security;
alter table public.checkpoint_blobs enable row level security;

create policy "Auth users can manage checkpoints"
  on public.checkpoints
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Auth users can manage checkpoint writes"
  on public.checkpoint_writes
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Auth users can manage checkpoint blobs"
  on public.checkpoint_blobs
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
