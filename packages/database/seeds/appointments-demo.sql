-- Deterministic Luma Studio appointments demonstration fixture.

insert into public.tenants (id, name, metadata)
values ('demo_appointments', 'Luma Studio Demo', '{"demo":true}'::jsonb)
on conflict (id) do update set name = excluded.name, metadata = excluded.metadata;

insert into public.venues (id, tenant_id, name, description, address)
values (
  '33000000-0000-4000-8000-000000000001',
  'demo_appointments',
  'Luma Studio',
  'Personal consultations and specialist-led care.',
  'Bangsar, Kuala Lumpur'
)
on conflict (id) do update set tenant_id = excluded.tenant_id, name = excluded.name,
  description = excluded.description, address = excluded.address;

insert into public.platform_business_profiles (
  id, tenant_id, venue_id, name, public_slug, preset_id, status, metadata
)
values (
  '33000000-0000-4000-8000-000000000002',
  'demo_appointments',
  '33000000-0000-4000-8000-000000000001',
  'Luma Studio',
  'luma-studio',
  'appointments_salon',
  'published',
  '{"demo":true}'::jsonb
)
on conflict (id) do update set name = excluded.name, public_slug = excluded.public_slug,
  preset_id = excluded.preset_id, status = excluded.status, metadata = excluded.metadata;

insert into public.platform_experience_configurations (
  id, business_id, version, state, preset_id, branding, terminology, channels, published_at
)
values (
  '33000000-0000-4000-8000-000000000003',
  '33000000-0000-4000-8000-000000000002',
  1,
  'published',
  'appointments_salon',
  '{"brand_name":"Luma Studio","description":"Choose a specialist and a time for considered personal care.","primary_color":"#a45d62","secondary_color":"#49383d"}'::jsonb,
  '{"customer":"Client","resource":"Specialist","booking":"Appointment"}'::jsonb,
  '{"web_booking":true,"web_chat":false,"whatsapp":false}'::jsonb,
  '2026-07-12T00:00:00Z'
)
on conflict (id) do update set state = excluded.state, branding = excluded.branding,
  terminology = excluded.terminology, channels = excluded.channels, published_at = excluded.published_at;

insert into public.services (
  id, venue_id, name, description, total_seats, resource_kind, selection_mode, reservation_policy, metadata
)
values (
  '33000000-0000-4000-8000-000000000010',
  '33000000-0000-4000-8000-000000000001',
  'Luma Signature Consultation',
  'A focused 45-minute appointment with a Luma specialist.',
  3,
  'custom',
  'assigned_resource',
  '{"kind":"assigned_resource","selection_mode":"assigned_resource","require_resource_labels":true,"allow_partial_capacity":false,"max_quantity":3}'::jsonb,
  '{"duration_minutes":45,"appointment_type":"consultation","demo":true}'::jsonb
)
on conflict (id) do update set venue_id = excluded.venue_id, name = excluded.name,
  description = excluded.description, total_seats = excluded.total_seats,
  resource_kind = excluded.resource_kind, selection_mode = excluded.selection_mode,
  reservation_policy = excluded.reservation_policy, metadata = excluded.metadata;

insert into public.reservable_resources (
  id, service_id, label, resource_kind, capacity, sort_order, status, metadata
)
values
  ('33000000-0000-4000-8000-000000000101', '33000000-0000-4000-8000-000000000010', 'Amina', 'custom', 1, 1, 'available', '{"specialties":["Skin health","Consultations"],"working_days":[1,2,3,4,5]}'::jsonb),
  ('33000000-0000-4000-8000-000000000102', '33000000-0000-4000-8000-000000000010', 'Jules', 'custom', 1, 2, 'available', '{"specialties":["Cut","Colour","Styling"],"working_days":[2,3,4,5,6]}'::jsonb),
  ('33000000-0000-4000-8000-000000000103', '33000000-0000-4000-8000-000000000010', 'Suki', 'custom', 1, 3, 'available', '{"specialties":["Wellness","Rituals"],"working_days":[1,2,4,5,6]}'::jsonb)
on conflict (id) do update set label = excluded.label, status = excluded.status, metadata = excluded.metadata;

insert into public.platform_availability_settings (
  tenant_id, venue_id, timezone, booking_horizon_days, slot_interval_minutes, minimum_notice_minutes
)
values ('demo_appointments', '33000000-0000-4000-8000-000000000001', 'Asia/Kuala_Lumpur', 45, 15, 120)
on conflict (tenant_id, venue_id) do update set timezone = excluded.timezone,
  booking_horizon_days = excluded.booking_horizon_days,
  slot_interval_minutes = excluded.slot_interval_minutes,
  minimum_notice_minutes = excluded.minimum_notice_minutes;

delete from public.platform_operating_intervals
where tenant_id = 'demo_appointments' and venue_id = '33000000-0000-4000-8000-000000000001';

insert into public.platform_operating_intervals (tenant_id, venue_id, day_of_week, start_time, end_time)
select 'demo_appointments', '33000000-0000-4000-8000-000000000001', day, '09:00', '18:00'
from generate_series(1, 5) as day
union all
select 'demo_appointments', '33000000-0000-4000-8000-000000000001', 6, '10:00', '16:00';

insert into public.bookings (
  id, service_id, user_name, user_email, booking_date, start_time, end_time,
  seats_booked, seat_labels, status, interface_type
)
values (
  '33000000-0000-4000-8000-000000000030',
  '33000000-0000-4000-8000-000000000010',
  'Demo Client',
  'client@example.invalid',
  '2026-08-04',
  '11:00',
  '11:45',
  1,
  array['Amina'],
  'confirmed',
  'form'
)
on conflict (id) do update set status = 'confirmed', seat_labels = excluded.seat_labels;

insert into public.reservation_items (id, booking_id, service_id, resource_id, resource_label, quantity, metadata)
values (
  '33000000-0000-4000-8000-000000000031',
  '33000000-0000-4000-8000-000000000030',
  '33000000-0000-4000-8000-000000000010',
  '33000000-0000-4000-8000-000000000101',
  'Amina',
  1,
  '{"demo":true,"appointment_type":"consultation"}'::jsonb
)
on conflict (id) do update set resource_label = excluded.resource_label, quantity = excluded.quantity;
