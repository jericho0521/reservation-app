-- Reservation platform database bundle artifact.
-- Source: supabase/base-schema.sql
-- Section: tenant/auth support, admin_users, and is_admin compatibility.
-- Status: concrete package-owned migration asset for admin compatibility
-- required by later RLS policies. This establishes the minimal admin_users
-- table and public.is_admin() helper used by the current package RLS bundle,
-- but tenant-aware auth/RLS semantics still require live database proof.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

revoke select on public.admin_users from anon;

drop policy if exists "Admin users can read their own admin row" on public.admin_users;
create policy "Admin users can read their own admin row"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;
