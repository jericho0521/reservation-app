-- Deterministic Northstar Rooms demonstration fixture.

insert into public.tenants (id, name, metadata)
values ('demo_rooms', 'Northstar Rooms Demo', '{"demo":true}'::jsonb)
on conflict (id) do update set name = excluded.name, metadata = excluded.metadata;

insert into public.venues (id, tenant_id, name, description, address)
values (
  '32000000-0000-4000-8000-000000000001',
  'demo_rooms',
  'Northstar Workspaces',
  'Quiet rooms for focused teams and decisive meetings.',
  'Central Business District, Kuala Lumpur'
)
on conflict (id) do update set tenant_id = excluded.tenant_id, name = excluded.name,
  description = excluded.description, address = excluded.address;

insert into public.platform_business_profiles (
  id, tenant_id, venue_id, name, public_slug, preset_id, status, metadata
)
values (
  '32000000-0000-4000-8000-000000000002',
  'demo_rooms',
  '32000000-0000-4000-8000-000000000001',
  'Northstar Rooms',
  'northstar-rooms',
  'rooms_facilities',
  'published',
  '{"demo":true}'::jsonb
)
on conflict (id) do update set name = excluded.name, public_slug = excluded.public_slug,
  preset_id = excluded.preset_id, status = excluded.status, metadata = excluded.metadata;

insert into public.platform_experience_configurations (
  id, business_id, version, state, preset_id, branding, terminology, channels, published_at
)
values (
  '32000000-0000-4000-8000-000000000003',
  '32000000-0000-4000-8000-000000000002',
  1,
  'published',
  'rooms_facilities',
  '{"brand_name":"Northstar Rooms","description":"Find a room that fits the team, equipment, and moment.","primary_color":"#156b55","secondary_color":"#16302a"}'::jsonb,
  '{"customer":"Organizer","resource":"Room","booking":"Meeting"}'::jsonb,
  '{"web_booking":true,"web_chat":false,"whatsapp":false}'::jsonb,
  '2026-07-12T00:00:00Z'
)
on conflict (id) do update set state = excluded.state, branding = excluded.branding,
  terminology = excluded.terminology, channels = excluded.channels, published_at = excluded.published_at;

insert into public.services (
  id, venue_id, name, description, total_seats, resource_kind, selection_mode, reservation_policy, metadata
)
values (
  '32000000-0000-4000-8000-000000000010',
  '32000000-0000-4000-8000-000000000001',
  'Northstar Meeting Rooms',
  'Book by attendee count, then choose a room with enough capacity.',
  36,
  'room',
  'hybrid',
  '{"kind":"hybrid","selection_mode":"hybrid","require_resource_labels":true,"allow_partial_capacity":true,"max_quantity":16}'::jsonb,
  '{"durations_minutes":[30,60,90,120],"demo":true}'::jsonb
)
on conflict (id) do update set venue_id = excluded.venue_id, name = excluded.name,
  description = excluded.description, total_seats = excluded.total_seats,
  resource_kind = excluded.resource_kind, selection_mode = excluded.selection_mode,
  reservation_policy = excluded.reservation_policy, metadata = excluded.metadata;

insert into public.resource_layouts (id, service_id, name, layout_kind, metadata, is_active)
values (
  '32000000-0000-4000-8000-000000000011',
  '32000000-0000-4000-8000-000000000010',
  'Northstar Floor Plan',
  'grid',
  '{"columns":2,"rows":2,"floor":"18"}'::jsonb,
  true
)
on conflict (id) do update set metadata = excluded.metadata, is_active = true;

insert into public.reservable_resources (
  id, service_id, layout_id, label, resource_kind, capacity, sort_order, status, metadata
)
values
  ('32000000-0000-4000-8000-000000000101', '32000000-0000-4000-8000-000000000010', '32000000-0000-4000-8000-000000000011', 'Focus Room', 'room', 4, 1, 'available', '{"equipment":["Display","Whiteboard"],"natural_light":true}'::jsonb),
  ('32000000-0000-4000-8000-000000000102', '32000000-0000-4000-8000-000000000010', '32000000-0000-4000-8000-000000000011', 'Studio Room', 'room', 6, 2, 'available', '{"equipment":["4K Display","Video Conferencing"],"natural_light":true}'::jsonb),
  ('32000000-0000-4000-8000-000000000103', '32000000-0000-4000-8000-000000000010', '32000000-0000-4000-8000-000000000011', 'Boardroom', 'room', 10, 3, 'available', '{"equipment":["Dual Display","Video Conferencing","Whiteboard"],"natural_light":true}'::jsonb),
  ('32000000-0000-4000-8000-000000000104', '32000000-0000-4000-8000-000000000010', '32000000-0000-4000-8000-000000000011', 'Forum', 'room', 16, 4, 'available', '{"equipment":["Projector","Hybrid Meeting Kit","Movable Tables"],"natural_light":false}'::jsonb)
on conflict (id) do update set label = excluded.label, capacity = excluded.capacity,
  status = excluded.status, metadata = excluded.metadata;

insert into public.platform_availability_settings (
  tenant_id, venue_id, timezone, booking_horizon_days, slot_interval_minutes, minimum_notice_minutes
)
values ('demo_rooms', '32000000-0000-4000-8000-000000000001', 'Asia/Kuala_Lumpur', 90, 30, 60)
on conflict (tenant_id, venue_id) do update set timezone = excluded.timezone,
  booking_horizon_days = excluded.booking_horizon_days,
  slot_interval_minutes = excluded.slot_interval_minutes,
  minimum_notice_minutes = excluded.minimum_notice_minutes;

delete from public.platform_operating_intervals
where tenant_id = 'demo_rooms' and venue_id = '32000000-0000-4000-8000-000000000001';

insert into public.platform_operating_intervals (tenant_id, venue_id, day_of_week, start_time, end_time)
select 'demo_rooms', '32000000-0000-4000-8000-000000000001', day, '08:00', '20:00'
from generate_series(1, 5) as day;

insert into public.service_seat_maintenance (id, service_id, seat_label, reason, is_active)
values (
  '32000000-0000-4000-8000-000000000020',
  '32000000-0000-4000-8000-000000000010',
  'Focus Room',
  'Display replacement',
  true
)
on conflict (id) do update set reason = excluded.reason, is_active = true;

insert into public.bookings (
  id, service_id, user_name, user_email, booking_date, start_time, end_time,
  seats_booked, seat_labels, status, interface_type
)
values (
  '32000000-0000-4000-8000-000000000030',
  '32000000-0000-4000-8000-000000000010',
  'Demo Organizer',
  'organizer@example.invalid',
  '2026-08-03',
  '10:00',
  '11:00',
  6,
  array['Boardroom'],
  'confirmed',
  'form'
)
on conflict (id) do update set status = 'confirmed', seats_booked = 6, seat_labels = excluded.seat_labels;

insert into public.reservation_items (id, booking_id, service_id, resource_id, resource_label, quantity, metadata)
values (
  '32000000-0000-4000-8000-000000000031',
  '32000000-0000-4000-8000-000000000030',
  '32000000-0000-4000-8000-000000000010',
  '32000000-0000-4000-8000-000000000103',
  'Boardroom',
  6,
  '{"demo":true,"purpose":"Quarterly planning"}'::jsonb
)
on conflict (id) do update set resource_label = excluded.resource_label, quantity = excluded.quantity;
