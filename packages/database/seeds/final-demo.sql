-- Deterministic final demonstration dataset for local/allowlisted databases only.
begin;

delete from public.platform_sessions where user_id in (
  select id from public.platform_users where tenant_id = 'final_demo'
);
delete from public.platform_staff_profiles where tenant_id = 'final_demo';
delete from public.platform_user_venue_assignments where tenant_id = 'final_demo';
delete from public.platform_users where tenant_id = 'final_demo';
delete from public.bookings where service_id in (
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000203'
);
delete from public.platform_conversations where tenant_id = 'final_demo';
delete from public.service_seat_maintenance where service_id in (
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000203'
);
delete from public.services where venue_id in (
  '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103'
);
delete from public.platform_business_profiles where tenant_id = 'final_demo';
delete from public.platform_availability_settings where tenant_id = 'final_demo';
delete from public.venues where tenant_id = 'final_demo';
delete from public.tenants where id = 'final_demo';

insert into public.tenants (id, name) values ('final_demo', 'Final Demonstration');
insert into public.venues (id, tenant_id, name) values
  ('00000000-0000-4000-8000-000000000101', 'final_demo', 'Apex Racing Lab'),
  ('00000000-0000-4000-8000-000000000102', 'final_demo', 'Harbour Rooms'),
  ('00000000-0000-4000-8000-000000000103', 'final_demo', 'Luma Appointments');
insert into public.platform_users (id, tenant_id, email, display_name, password_hash, role, status) values
  ('00000000-0000-4000-8000-000000000701', 'final_demo', 'browser-owner@example.test', 'Browser Fixture Owner', 'local-browser-fixture-disabled-login', 'owner', 'active');
insert into public.platform_user_venue_assignments (tenant_id, user_id, venue_id) values
  ('final_demo', '00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000101');
insert into public.platform_sessions (id, user_id, token_hash, expires_at) values
  ('00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000701', 'fa5e2abea2501849521c69a22b04b264ec714256b069573c898f1598a6031749', now() + interval '30 days');
insert into public.platform_business_profiles (id, tenant_id, venue_id, name, public_slug, preset_id, status) values
  ('00000000-0000-4000-8000-000000000111', 'final_demo', '00000000-0000-4000-8000-000000000101', 'Apex Racing Lab', 'apex-racing-demo', 'racing_gaming', 'published'),
  ('00000000-0000-4000-8000-000000000112', 'final_demo', '00000000-0000-4000-8000-000000000102', 'Harbour Rooms', 'harbour-rooms-demo', 'rooms_facilities', 'published'),
  ('00000000-0000-4000-8000-000000000113', 'final_demo', '00000000-0000-4000-8000-000000000103', 'Luma Appointments', 'luma-appointments-demo', 'appointments_salon', 'published');
insert into public.platform_experience_configurations (id, business_id, version, state, preset_id, branding, terminology, channels, published_at) values
  ('00000000-0000-4000-8000-000000000121', '00000000-0000-4000-8000-000000000111', 1, 'published', 'racing_gaming', '{"brand_name":"Apex Racing Lab","primary_color":"#ffb547","description":"Competitive simulator sessions."}', '{"customer":"Driver","resource":"Simulator","booking":"Session"}', '{"web_booking":true,"web_chat":true,"whatsapp":true}', now()),
  ('00000000-0000-4000-8000-000000000122', '00000000-0000-4000-8000-000000000112', 1, 'published', 'rooms_facilities', '{"brand_name":"Harbour Rooms","primary_color":"#38bdf8","description":"Flexible meeting rooms."}', '{"customer":"Guest","resource":"Room","booking":"Reservation"}', '{"web_booking":true,"web_chat":true,"whatsapp":true}', now()),
  ('00000000-0000-4000-8000-000000000123', '00000000-0000-4000-8000-000000000113', 1, 'published', 'appointments_salon', '{"brand_name":"Luma Appointments","primary_color":"#f472b6","description":"Personal appointment scheduling."}', '{"customer":"Client","resource":"Specialist","booking":"Appointment"}', '{"web_booking":true,"web_chat":true,"whatsapp":true}', now());

insert into public.platform_availability_settings (tenant_id, venue_id, timezone, booking_horizon_days, minimum_notice_minutes, slot_interval_minutes) values
  ('final_demo', '00000000-0000-4000-8000-000000000101', 'Asia/Kuala_Lumpur', 60, 60, 30),
  ('final_demo', '00000000-0000-4000-8000-000000000102', 'Asia/Kuala_Lumpur', 90, 120, 60),
  ('final_demo', '00000000-0000-4000-8000-000000000103', 'Asia/Kuala_Lumpur', 45, 60, 30);
insert into public.platform_operating_intervals (tenant_id, venue_id, day_of_week, start_time, end_time)
select 'final_demo', venue_id, day, '09:00', '18:00'
from (values ('00000000-0000-4000-8000-000000000101'::uuid), ('00000000-0000-4000-8000-000000000102'::uuid), ('00000000-0000-4000-8000-000000000103'::uuid)) venues(venue_id)
cross join generate_series(1, 6) day;

insert into public.services (id, venue_id, name, description, total_seats, resource_kind, selection_mode, reservation_policy, metadata, booking_mode) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'Apex GT Racing Session', 'One-hour simulator session', 3, 'station', 'assigned_resource', '{"kind":"assigned_resource","selection_mode":"assigned_resource","require_resource_labels":true,"allow_partial_capacity":false}', '{"duration_minutes":60}', 'resource'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', 'Harbour Meeting Room', 'Two-hour room reservation', 2, 'room', 'assigned_resource', '{"kind":"assigned_resource","selection_mode":"assigned_resource","require_resource_labels":true,"allow_partial_capacity":false}', '{"duration_minutes":120}', 'resource'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000103', 'Luma Consultation', 'Thirty-minute consultation', 2, 'custom', 'assigned_resource', '{"kind":"assigned_resource","selection_mode":"assigned_resource","require_resource_labels":true,"allow_partial_capacity":false}', '{"duration_minutes":30}', 'appointment');
insert into public.reservable_resources (id, service_id, label, resource_kind, capacity, sort_order, metadata) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 'Simulator A', 'station', 1, 1, '{}'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000201', 'Simulator B', 'station', 1, 2, '{}'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000201', 'Simulator C', 'station', 1, 3, '{}'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000202', 'Harbour One', 'room', 1, 1, '{}'),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000202', 'Harbour Two', 'room', 1, 2, '{}'),
  ('00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000203', 'Specialist Maya', 'custom', 1, 1, '{"platform_staff_id":"00000000-0000-4000-8000-000000000801","practitioner_display_name":"Specialist Maya"}'),
  ('00000000-0000-4000-8000-000000000307', '00000000-0000-4000-8000-000000000203', 'Specialist Noah', 'custom', 1, 2, '{"platform_staff_id":"00000000-0000-4000-8000-000000000802","practitioner_display_name":"Specialist Noah"}');

insert into public.platform_staff_profiles (id, tenant_id, display_name, reservable_resource_id) values
  ('00000000-0000-4000-8000-000000000801', 'final_demo', 'Specialist Maya', '00000000-0000-4000-8000-000000000306'),
  ('00000000-0000-4000-8000-000000000802', 'final_demo', 'Specialist Noah', '00000000-0000-4000-8000-000000000307');
insert into public.platform_staff_locations (staff_id, venue_id) values
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000103'),
  ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000103');
insert into public.platform_staff_services (staff_id, service_id) values
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000203'),
  ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000203');

insert into public.bookings (id, service_id, user_name, user_email, user_phone, booking_date, start_time, end_time, seats_booked, seat_labels, status, interface_type, created_at, staff_id) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000201', 'Aina Driver', 'aina@example.test', '+601100000001', current_date, '10:00', '11:00', 1, '{"Simulator A"}', 'confirmed', 'form', now() - interval '2 days', null),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000201', 'Ben Racer', 'ben@example.test', '+601100000002', current_date, '14:00', '15:00', 1, '{"Simulator B"}', 'confirmed', 'chat', now() - interval '1 day', null),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000202', 'Cora Guest', 'cora@example.test', '+601100000003', current_date + 1, '09:00', '11:00', 1, '{"Harbour One"}', 'confirmed', 'form', now(), null),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000203', 'Dev Client', 'dev@example.test', '+601100000004', current_date - 1, '15:00', '15:30', 1, '{"Specialist Maya"}', 'cancelled', 'chat', now() - interval '3 days', '00000000-0000-4000-8000-000000000801');
insert into public.reservation_items (booking_id, service_id, resource_id, resource_label, quantity) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000301', 'Simulator A', 1),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000302', 'Simulator B', 1),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000304', 'Harbour One', 1),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000306', 'Specialist Maya', 1);
insert into public.platform_reservation_management_tokens (id, booking_id, token_hash, expires_at) values
  ('00000000-0000-4000-8000-000000000703', '00000000-0000-4000-8000-000000000401', '1481be4aedd353e8289aa206fd6097e082ce5f969544eeb4f841a1576cfd1296', now() + interval '30 days');
insert into public.service_seat_maintenance (id, service_id, seat_label, reason, is_active) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000201', 'Simulator C', 'Scheduled wheel calibration', true);

insert into public.platform_conversations (id, tenant_id, venue_id, channel, channel_thread_id, automation_state, reservation_id, last_message_at, created_at) values
  ('00000000-0000-4000-8000-000000000601', 'final_demo', '00000000-0000-4000-8000-000000000101', 'web_chat', 'demo-web-chat', 'automated', '00000000-0000-4000-8000-000000000402', now(), now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000602', 'final_demo', '00000000-0000-4000-8000-000000000101', 'simulation', 'simulation:demo-customer@s.whatsapp.net', 'manual', null, now(), now());
insert into public.platform_conversation_participants (conversation_id, role, channel_identifier, identifier_hash, display_name, contact_hint) values
  ('00000000-0000-4000-8000-000000000601', 'customer', null, repeat('a', 64), 'Ben Racer', '***0002'),
  ('00000000-0000-4000-8000-000000000602', 'customer', 'demo-customer@s.whatsapp.net', repeat('b', 64), 'Demo Customer', '***demo');
insert into public.platform_conversation_messages (conversation_id, channel, direction, sender_type, delivery_state, external_message_id, content, reservation_id, metadata, created_at) values
  ('00000000-0000-4000-8000-000000000601', 'web_chat', 'inbound', 'customer', 'delivered', 'demo-in-1', 'Book GT Racing Session tomorrow at 14:00.', null, '{}', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000601', 'web_chat', 'outbound', 'automation', 'sent', null, 'I found the 14:00 slot. Please confirm.', null, '{"event":"booking.proposed","proposal_id":"demo-proposal"}', now() - interval '23 hours'),
  ('00000000-0000-4000-8000-000000000601', 'web_chat', 'inbound', 'system', 'delivered', 'confirmation:demo-proposal', 'Booking confirmation requested.', null, '{"event":"booking.confirmation_requested","proposal_id":"demo-proposal"}', now() - interval '22 hours'),
  ('00000000-0000-4000-8000-000000000601', 'web_chat', 'outbound', 'automation', 'sent', null, 'Booking confirmed.', '00000000-0000-4000-8000-000000000402', '{"event":"booking.confirmed","proposal_id":"demo-proposal"}', now() - interval '21 hours'),
  ('00000000-0000-4000-8000-000000000602', 'simulation', 'inbound', 'customer', 'delivered', 'demo-sim-1', 'Can staff help me?', null, '{}', now());

commit;
