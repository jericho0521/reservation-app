-- Walk-in bookings created by staff from the admin area.
--
-- Staff record walk-in customers so their seats and hours are blocked for
-- online customers. These rows use interface_type = 'walk_in'. The public
-- creation endpoints enforce customer and staff authorization; direct anonymous
-- inserts are disabled by reservations-rls.sql.
--
-- Run this once in the Supabase SQL editor (or via the CLI) after deploying.

alter table public.bookings
  drop constraint if exists bookings_interface_type_check;

alter table public.bookings
  add constraint bookings_interface_type_check
  check (interface_type in ('form', 'chat', 'walk_in'));
