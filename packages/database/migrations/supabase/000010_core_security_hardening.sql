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
