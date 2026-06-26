-- Reservation platform database bundle artifact.
-- Source: supabase/security-hardening.sql
-- Section: reservation table hardening, function search paths, grants,
-- indexes, and core policy hardening.
-- Status: concrete package-owned hardening migration. This intentionally
-- excludes mixed-ownership seed/backfill rows, Project Play compatibility
-- data, content/reporting SQL, AI retrieval/checkpoint SQL, and storage bucket
-- policies from the source file.

-- Keep the admin compatibility helper pinned to explicit schemas.
alter function public.is_admin()
set search_path = public, auth;

-- Reassert admin table exposure after the RLS migration has installed policies.
revoke select on public.admin_users from anon;

-- Keep shared trigger and package-owned RPC helpers pinned to deterministic
-- search paths. These functions are created by earlier package migrations.
alter function public.set_updated_at()
set search_path = public;

alter function public.replace_service_seat_maintenance(uuid, text[], text, uuid)
set search_path = public, auth;

alter function public.create_reservation_atomic(jsonb)
set search_path = public;

-- Reassert package-owned RPC privilege boundaries without changing function
-- bodies already owned by earlier migrations.
revoke all on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) from public;
grant execute on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) to authenticated;

revoke all on function public.create_reservation_atomic(jsonb) from public;
grant execute on function public.create_reservation_atomic(jsonb) to service_role;

grant select on public.services, public.venues to anon, authenticated;
grant select on public.resource_layouts, public.reservable_resources, public.service_availability_rules
  to anon, authenticated;

grant insert on public.bookings, public.reservation_items to anon, authenticated;

grant select on public.admin_users to authenticated;
grant select, insert, update, delete on
  public.services,
  public.venues,
  public.resource_layouts,
  public.reservable_resources,
  public.service_availability_rules,
  public.bookings,
  public.reservation_items,
  public.service_seat_maintenance
to authenticated;

grant select, insert, update, delete on
  public.services,
  public.venues,
  public.resource_layouts,
  public.reservable_resources,
  public.service_availability_rules,
  public.bookings,
  public.reservation_items,
  public.service_seat_maintenance,
  public.admin_users
to service_role;
