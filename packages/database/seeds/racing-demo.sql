-- Deterministic Apex Grid racing-simulator demonstration.
-- Safe to re-run against a development database after the core migrations.

insert into public.tenants (id, name, metadata)
values ('demo_racing', 'Apex Grid Demo', '{"demo":true}'::jsonb)
on conflict (id) do update set name = excluded.name, metadata = excluded.metadata;

insert into public.venues (id, tenant_id, name, description, address)
values (
  '31000000-0000-4000-8000-000000000001',
  'demo_racing',
  'Apex Grid Racing Lounge',
  'Premium simulator sessions with live rig availability.',
  'Demo Circuit, Kuala Lumpur'
)
on conflict (id) do update set
  tenant_id = excluded.tenant_id,
  name = excluded.name,
  description = excluded.description,
  address = excluded.address;

insert into public.platform_business_profiles (
  id, tenant_id, venue_id, name, public_slug, preset_id, status, metadata
)
values (
  '31000000-0000-4000-8000-000000000002',
  'demo_racing',
  '31000000-0000-4000-8000-000000000001',
  'Apex Grid',
  'apex-grid',
  'racing_gaming',
  'published',
  '{"demo":true}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  public_slug = excluded.public_slug,
  preset_id = excluded.preset_id,
  status = excluded.status,
  metadata = excluded.metadata;

insert into public.platform_experience_configurations (
  id, business_id, version, state, preset_id, branding, terminology, channels, published_at
)
values (
  '31000000-0000-4000-8000-000000000003',
  '31000000-0000-4000-8000-000000000002',
  1,
  'published',
  'racing_gaming',
  '{"brand_name":"Apex Grid","description":"Race legendary circuits on competition-grade direct-drive simulators.","primary_color":"#ff4d00","secondary_color":"#090b10"}'::jsonb,
  '{"customer":"Driver","resource":"Simulator","booking":"Race Session"}'::jsonb,
  '{"web_booking":true,"web_chat":false,"whatsapp":false}'::jsonb,
  '2026-07-12T00:00:00Z'
)
on conflict (id) do update set
  state = excluded.state,
  branding = excluded.branding,
  terminology = excluded.terminology,
  channels = excluded.channels,
  published_at = excluded.published_at;

insert into public.services (
  id, venue_id, name, description, total_seats, resource_kind, selection_mode, reservation_policy, metadata
)
values (
  '31000000-0000-4000-8000-000000000010',
  '31000000-0000-4000-8000-000000000001',
  'Apex Grid Grand Prix Session',
  '60-minute coached session on your chosen competition simulator.',
  6,
  'station',
  'assigned_resource',
  '{"kind":"assigned_resource","selection_mode":"assigned_resource","require_resource_labels":true,"allow_partial_capacity":true,"max_quantity":6}'::jsonb,
  '{"track_rotation":["Spa-Francorchamps","Suzuka","Sepang"],"session_level":"all_levels","demo":true}'::jsonb
)
on conflict (id) do update set
  venue_id = excluded.venue_id,
  name = excluded.name,
  description = excluded.description,
  total_seats = excluded.total_seats,
  resource_kind = excluded.resource_kind,
  selection_mode = excluded.selection_mode,
  reservation_policy = excluded.reservation_policy,
  metadata = excluded.metadata;

insert into public.resource_layouts (id, service_id, name, layout_kind, metadata, is_active)
values (
  '31000000-0000-4000-8000-000000000011',
  '31000000-0000-4000-8000-000000000010',
  'Apex Grid Pit Lane',
  'grid',
  '{"columns":3,"rows":2,"zone":"pit-lane"}'::jsonb,
  true
)
on conflict (id) do update set metadata = excluded.metadata, is_active = true;

insert into public.reservable_resources (
  id, service_id, layout_id, label, resource_kind, capacity, sort_order, status, metadata
)
select
  ('31000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  '31000000-0000-4000-8000-000000000010'::uuid,
  '31000000-0000-4000-8000-000000000011'::uuid,
  'SIM ' || lpad(number::text, 2, '0'),
  'station',
  1,
  number,
  'available',
  jsonb_build_object(
    'wheelbase', case when number <= 2 then '20Nm Direct Drive' else '15Nm Direct Drive' end,
    'display', case when number % 2 = 0 then 'Triple 32-inch' else '49-inch Ultrawide' end,
    'pedals', 'Load cell',
    'demo', true
  )
from generate_series(1, 6) as number
on conflict (id) do update set
  label = excluded.label,
  status = excluded.status,
  metadata = excluded.metadata;

insert into public.platform_availability_settings (
  tenant_id, venue_id, timezone, booking_horizon_days, slot_interval_minutes, minimum_notice_minutes
)
values ('demo_racing', '31000000-0000-4000-8000-000000000001', 'Asia/Kuala_Lumpur', 60, 30, 120)
on conflict (tenant_id, venue_id) do update set
  timezone = excluded.timezone,
  booking_horizon_days = excluded.booking_horizon_days,
  slot_interval_minutes = excluded.slot_interval_minutes,
  minimum_notice_minutes = excluded.minimum_notice_minutes;

delete from public.platform_operating_intervals
where tenant_id = 'demo_racing' and venue_id = '31000000-0000-4000-8000-000000000001';

insert into public.platform_operating_intervals (tenant_id, venue_id, day_of_week, start_time, end_time)
select 'demo_racing', '31000000-0000-4000-8000-000000000001', day, '10:00', '22:00'
from generate_series(1, 5) as day
union all
select 'demo_racing', '31000000-0000-4000-8000-000000000001', day, '09:00', '23:00'
from generate_series(0, 6) as day where day in (0, 6);

insert into public.service_seat_maintenance (id, service_id, seat_label, reason, is_active)
values (
  '31000000-0000-4000-8000-000000000020',
  '31000000-0000-4000-8000-000000000010',
  'SIM 04',
  'Pedal calibration',
  true
)
on conflict (id) do update set reason = excluded.reason, is_active = true;

insert into public.bookings (
  id, service_id, user_name, user_email, booking_date, start_time, end_time,
  seats_booked, seat_labels, status, interface_type
)
values (
  '31000000-0000-4000-8000-000000000030',
  '31000000-0000-4000-8000-000000000010',
  'Demo Driver',
  'driver@example.invalid',
  '2026-08-01',
  '14:00',
  '15:00',
  1,
  array['SIM 02'],
  'confirmed',
  'form'
)
on conflict (id) do update set status = 'confirmed', seat_labels = excluded.seat_labels;

insert into public.reservation_items (id, booking_id, service_id, resource_id, resource_label, quantity, metadata)
values (
  '31000000-0000-4000-8000-000000000031',
  '31000000-0000-4000-8000-000000000030',
  '31000000-0000-4000-8000-000000000010',
  '31000000-0000-4000-8000-000000000002',
  'SIM 02',
  1,
  '{"demo":true}'::jsonb
)
on conflict (id) do update set resource_label = excluded.resource_label, quantity = excluded.quantity;
