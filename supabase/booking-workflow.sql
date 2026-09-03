-- Add the staff-controlled in-progress state used by the admin Kanban board.
-- Safe to rerun against an existing reservation database.

begin;

alter table public.bookings
drop constraint if exists bookings_status_check;

alter table public.bookings
add constraint bookings_status_check
check (status in ('confirmed', 'in_progress', 'completed', 'cancelled'));

commit;
