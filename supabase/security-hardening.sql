-- Security hardening for an already-created Supabase database.
-- Run this after base-schema.sql and the feature-specific SQL files.
-- IMPORTANT: add your admin auth user to public.admin_users before relying on admin pages.

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

alter table public.bookings
add column if not exists user_phone text;

create extension if not exists pg_trgm with schema extensions;

create index if not exists bookings_customer_search_idx
on public.bookings using gin (user_name gin_trgm_ops, user_email gin_trgm_ops, user_phone gin_trgm_ops);

create table if not exists public.service_seat_maintenance (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  seat_label text not null,
  reason text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_seat_maintenance_label_check check (seat_label ~ '^RS([1-9]|1[0-6])$')
);

create unique index if not exists service_seat_maintenance_service_label_key
on public.service_seat_maintenance (service_id, seat_label);

create index if not exists service_seat_maintenance_active_idx
on public.service_seat_maintenance (service_id, is_active);

alter table public.service_seat_maintenance enable row level security;

create or replace function public.replace_service_seat_maintenance(
  p_service_id uuid,
  p_seat_labels text[],
  p_reason text default null,
  p_created_by uuid default null
)
returns table (seat_label text)
language plpgsql
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin privileges required' using errcode = '42501';
  end if;

  update public.service_seat_maintenance
  set is_active = false
  where service_id = p_service_id
    and is_active = true;

  if coalesce(array_length(p_seat_labels, 1), 0) > 0 then
    insert into public.service_seat_maintenance (
      service_id,
      seat_label,
      reason,
      is_active,
      created_by
    )
    select
      p_service_id,
      labels.seat_label,
      nullif(trim(coalesce(p_reason, '')), ''),
      true,
      p_created_by
    from unnest(p_seat_labels) as labels(seat_label)
    on conflict (service_id, seat_label)
    do update set
      reason = excluded.reason,
      is_active = true,
      created_by = excluded.created_by,
      updated_at = now();
  end if;

  return query
  select maintenance.seat_label
  from public.service_seat_maintenance as maintenance
  where maintenance.service_id = p_service_id
    and maintenance.is_active = true
  order by (substring(maintenance.seat_label from 3))::integer;
end;
$$;

revoke all on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) from public;
grant execute on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) to authenticated;

alter function public.set_updated_at()
set search_path = public;

drop trigger if exists set_service_seat_maintenance_updated_at on public.service_seat_maintenance;
create trigger set_service_seat_maintenance_updated_at
before update on public.service_seat_maintenance
for each row execute function public.set_updated_at();

alter function public.set_content_posts_updated_at()
set search_path = public;

alter function public.match_knowledge(extensions.vector, jsonb, double precision, integer)
set search_path = public, extensions;

drop policy if exists "Authenticated admins can manage services" on public.services;
create policy "Authenticated admins can manage services"
on public.services
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated admins can manage venues" on public.venues;
create policy "Authenticated admins can manage venues"
on public.venues
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

do $$
begin
  if to_regclass('public.equipment') is not null then
    execute 'drop policy if exists "Authenticated admins can manage equipment" on public.equipment';
    execute 'create policy "Authenticated admins can manage equipment" on public.equipment for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;

drop policy if exists "Authenticated admins can manage bookings" on public.bookings;
create policy "Authenticated admins can manage bookings"
on public.bookings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;

drop policy if exists "Authenticated admins can manage seat maintenance" on public.service_seat_maintenance;
create policy "Authenticated admins can manage seat maintenance"
on public.service_seat_maintenance
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated users can manage content" on public.content_posts;
create policy "Authenticated users can manage content"
on public.content_posts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated admins can manage sales report documents" on public.sales_report_documents;
create policy "Authenticated admins can manage sales report documents"
on public.sales_report_documents
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated admins can manage daily sales reports" on public.daily_sales_reports;
create policy "Authenticated admins can manage daily sales reports"
on public.daily_sales_reports
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Auth users can manage checkpoints" on public.checkpoints;
create policy "Auth users can manage checkpoints"
on public.checkpoints
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Auth users can manage checkpoint writes" on public.checkpoint_writes;
create policy "Auth users can manage checkpoint writes"
on public.checkpoint_writes
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Auth users can manage checkpoint blobs" on public.checkpoint_blobs;
create policy "Auth users can manage checkpoint blobs"
on public.checkpoint_blobs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Blog assets are publicly readable" on storage.objects;

drop policy if exists "Authenticated users can manage blog assets" on storage.objects;
create policy "Authenticated users can manage blog assets"
on storage.objects
for all
to authenticated
using (bucket_id = 'blog-assets' and public.is_admin())
with check (bucket_id = 'blog-assets' and public.is_admin());

drop policy if exists "Authenticated admins can manage sales report files" on storage.objects;
create policy "Authenticated admins can manage sales report files"
on storage.objects
for all
to authenticated
using (bucket_id = 'sales-report-documents' and public.is_admin())
with check (bucket_id = 'sales-report-documents' and public.is_admin());
