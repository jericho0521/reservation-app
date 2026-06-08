# Phase 0 Baseline Inventory

This inventory captures current reservation behavior before the modularity refactor. Later phases should treat these as compatibility requirements unless a deliberate downstream change is documented.

## Racing-Specific Assumptions

- The shared service contract still names capacity as `total_seats`, booking quantity as `seats_booked`, and optional exact allocations as `seat_labels` (`types/index.ts:1`, `types/index.ts:11`, `types/index.ts:23`).
- Racing simulator behavior is detected by capacity, not by an explicit service type: `total_seats === 16` switches the public form into exact seat-map selection and the admin maintenance page into racing maintenance mode (`components/form/MultiStepForm.tsx:156`, `components/form/MultiStepForm.tsx:202`, `components/admin/SeatMaintenanceManager.tsx:48`, `app/api/seat-maintenance/route.ts:6`).
- Racing labels use the `RS` prefix with numeric labels `RS1` through `RS16`; normalization accepts variants like `rs1` and `RS 12` but rejects non-`RS` labels and labels outside 1-16 (`lib/seat-maintenance.ts:1`, `lib/seat-maintenance.ts:2`, `lib/seat-maintenance.ts:3`, `components/form/SeatMap.tsx:20`, `components/form/SeatMap.tsx:23`).
- Fallback labels for bookings missing explicit `seat_labels` are generated as `RS{seatNumber}` from the highest numbered seat downward. This is used by both availability display and capacity conflict checks (`lib/availability.ts:23`, `lib/availability.ts:44`, `lib/reservation-capacity.ts:55`, `lib/reservation-capacity.ts:75`).
- The racing seat layout is hard-coded as two islands: Island A uses `RS1`-`RS4` and `RS9`-`RS12`; Island B uses `RS5`-`RS8` and `RS13`-`RS16` (`components/form/SeatMap.tsx:128`, `components/admin/SeatMaintenanceManager.tsx:232`, `components/admin/SeatMaintenanceManager.tsx:261`, `components/admin/SeatMaintenanceManager.tsx:300`, `components/admin/SeatMaintenanceManager.tsx:329`).
- Chat prompts and analytics snapshots hard-code the two current product names and capacities: Racing Simulator has 16 seats, Playstation 5 has 2 seats (`app/api/chat/chat-config.ts:24`, `app/api/chat/chat-config.ts:25`, `lib/langchain/prompts.ts:7`, `lib/langchain/prompts.ts:8`, `app/api/analytics-chat/snapshot.ts:4`, `app/api/analytics-chat/snapshot.ts:5`).

## Current Reservation Compatibility Behavior

- Services are loaded from `/api/services` and returned as raw service rows ordered by name; the public form expects `id`, `name`, `description`, and `total_seats` (`app/api/services/route.ts:7`, `components/form/ServiceSelector.tsx:37`, `components/form/ServiceSelector.tsx:80`).
- Public booking flow defaults to `interface_type: "form"` and initially `seats_booked: 1`; selecting a 16-seat service resets booked seats to `0` until exact seats are selected, while count-only services reset to `1` (`components/form/MultiStepForm.tsx:32`, `components/form/MultiStepForm.tsx:145`, `components/form/MultiStepForm.tsx:156`).
- Racing Simulator bookings must include selected labels matching `seats_booked`; the public form enforces that before advancing, and `/api/bookings` rejects mismatches for 16-seat services (`components/form/MultiStepForm.tsx:321`, `app/api/bookings/route.ts:132`).
- PS5 and other non-16-seat services are currently count-only: the form shows a numeric input, sends `seat_labels: []`, and `/api/bookings` allows empty labels as long as requested count does not exceed available capacity (`components/form/MultiStepForm.tsx:213`, `components/form/MultiStepForm.tsx:224`, `components/form/MultiStepForm.tsx:66`, `app/api/bookings/route.ts:129`, `app/api/bookings/route.ts:138`).
- Availability is one-hour slots from noon through midnight, with midnight represented as `00:00` and end time wrapping with modulo 24 (`lib/availability.ts:10`, `lib/availability.ts:13`).
- Availability and booking creation only consider same-start-time bookings as conflicting; adjacent one-hour bookings do not overlap in the current engine (`lib/reservation-capacity.ts:13`, `lib/reservation-capacity.test.ts:44`).
- Maintenance seats reduce availability for every slot, are included in `taken_seat_labels`, and are separately exposed as `maintenance_seat_labels` only when non-empty (`lib/availability.ts:72`, `lib/availability.ts:84`, `lib/availability.ts:96`).
- Booking creation checks service existence, confirmed bookings for the same service/date, active maintenance seats, total available capacity, maintenance conflicts, and exact seat conflicts before inserting a confirmed booking (`app/api/bookings/route.ts:83`, `app/api/bookings/route.ts:100`, `app/api/bookings/route.ts:109`, `app/api/bookings/route.ts:125`, `app/api/bookings/route.ts:146`, `app/api/bookings/route.ts:157`, `app/api/bookings/route.ts:167`).
- Admin booking search filters customer name, email, and phone, limits search results to 100, and returns booking rows with related service names (`app/api/bookings/route.ts:27`, `app/api/bookings/route.ts:38`, `app/api/bookings/route.ts:50`).
- Chat booking confirmation validates service, date, time, positive integer seats, name, email, and phone, then creates bookings through the chat agent with `interface_type: "chat"` (`app/api/chat/route.ts:12`, `lib/langchain/chat-agent.ts:368`, `lib/langchain/chat-agent.ts:408`).

## Public API Response Shapes

- `GET /api/services`: returns an array of service rows. Frontend consumers expect at least `{ id, name, description?, total_seats, created_at }` (`app/api/services/route.ts:7`, `types/index.ts:1`, `components/form/ServiceSelector.tsx:37`).
- `GET /api/availability?service_id=&date=`: success shape is `{ timeSlots, totalSeats }`, where each slot has `start_time`, `end_time`, `available_seats`, `is_available`, `taken_seat_labels`, and optional `maintenance_seat_labels` (`app/api/availability/route.ts:56`, `types/index.ts:23`, `components/form/TimeSlotSelector.tsx:26`). Missing params return `{ error: "service_id and date are required" }` with status 400 (`app/api/availability/route.test.ts:5`).
- `GET /api/bookings`: authenticated admin-only success shape is raw booking rows with `services(name)` included; errors use `{ error }` (`app/api/bookings/route.ts:50`, `app/api/bookings/route.ts:73`).
- `POST /api/bookings`: request requires `service_id`, `user_name`, `user_email`, `user_phone`, `booking_date`, `start_time`, `end_time`, `seats_booked`, optional `seat_labels`, and `interface_type`. Success returns the inserted booking row with status 201 (`app/api/bookings/route.ts:13`, `app/api/bookings/route.ts:167`, `app/api/bookings/route.ts:179`).
- `POST /api/bookings` error shapes currently include `{ error: "Invalid booking data", details }`, `{ error: "Invalid JSON body" }`, `{ error: "Not enough seats available", available_seats }`, `{ error: "Some selected seats are under maintenance", seat_labels }`, and `{ error: "Some selected seats are no longer available", seat_labels }` (`app/api/bookings/route.ts:139`, `app/api/bookings/route.ts:150`, `app/api/bookings/route.ts:161`, `app/api/bookings/route.ts:181`, `app/api/bookings/route.ts:185`).
- `GET /api/seat-maintenance?service_id=`: authenticated admin-only success shape is `{ seats: [{ id, service_id, seat_label, reason, is_active, updated_at }] }`; missing `service_id` returns `{ error: "service_id is required" }` (`app/api/seat-maintenance/route.ts:31`, `app/api/seat-maintenance/route.ts:41`, `app/api/seat-maintenance/route.ts:52`, `app/api/seat-maintenance/route.test.ts:5`).
- `PUT /api/seat-maintenance`: request shape is `{ service_id, seat_labels, reason? }`; success shape is `{ seat_labels }`. Invalid labels return `{ error: "Invalid seat labels" }`, and non-16-seat services return `{ error: "Seat maintenance is only available for racing simulator services" }` (`app/api/seat-maintenance/route.ts:8`, `app/api/seat-maintenance/route.ts:66`, `app/api/seat-maintenance/route.ts:84`, `app/api/seat-maintenance/route.ts:96`).
- `POST /api/chat`: normal chat success returns `{ content, action, threadId }`; confirmation success returns `{ content, action: { type: "booking_success", data } }`; invalid confirmation returns the same shape with `action: null`, `threadId`, and status 400 (`app/api/chat/route.ts:43`, `app/api/chat/route.ts:68`, `app/api/chat/route.ts:93`).

## Database Constraints and Couplings

- `services.total_seats` is the only persisted capacity/configuration field for reservation resources; there is no generic resource label/type table yet (`supabase/base-schema.sql:30`, `supabase/base-schema.sql:210`, `supabase/base-schema.sql:216`).
- `bookings.seats_booked` must be positive; `seat_labels` is a `text[]` defaulting to an empty array; `interface_type` is restricted to `form` or `chat`; `status` is restricted to `confirmed`, `completed`, or `cancelled` (`supabase/base-schema.sql:81`, `supabase/base-schema.sql:82`, `supabase/base-schema.sql:83`, `supabase/base-schema.sql:84`).
- `service_seat_maintenance.seat_label` is constrained to `^RS([1-9]|1[0-6])$` in both base and security-hardening SQL, blocking generic labels such as `PS1`, `PC-A`, or lane-style resource names (`supabase/base-schema.sql:98`, `supabase/security-hardening.sql:51`).
- `replace_service_seat_maintenance` accepts `text[]` labels, requires `public.is_admin()`, deactivates all active maintenance rows for a service, upserts the submitted labels, and orders returned labels by the numeric part after `RS` (`supabase/base-schema.sql:107`, `supabase/base-schema.sql:117`, `supabase/base-schema.sql:122`, `supabase/base-schema.sql:141`, `supabase/base-schema.sql:156`).
- RLS allows public insert into `bookings` only for confirmed form/chat bookings and keeps booking reads/admin maintenance behind authenticated admin policies (`supabase/reservations-rls.sql:73`, `supabase/reservations-rls.sql:80`, `supabase/reservations-rls.sql:83`, `supabase/reservations-rls.sql:93`).

## Relevant Tests to Keep Passing

- `lib/availability.test.ts`: validates time-slot generation, fallback `RS` labels, explicit seat labels, maintenance seats, no double-counting under maintenance, invalid label normalization, and midnight end-time rollover.
- `lib/reservation-capacity.test.ts`: validates seat-count capacity, maintenance capacity, slot matching by normalized `HH:MM`, and explicit seat-label conflicts.
- `lib/seat-maintenance.test.ts`: validates `RS` normalization/deduping/sorting and rejection of `PS1`, `RS0`, and `RS17`.
- `components/form/SeatMap.test.ts`: validates toggle behavior and parsing racing simulator labels while rejecting invalid labels.
- `app/api/availability/route.test.ts`: validates missing availability params response shape.
- `app/api/bookings/route.test.ts`: validates invalid booking payload, malformed JSON, and admin search term/filter escaping.
- `app/api/seat-maintenance/route.test.ts`: validates missing `service_id` response and 16-seat-only maintenance support.
- `app/api/chat/route.test.ts`, `app/api/chat/chat-config.test.ts`, `app/api/chat/tool-loop.test.ts`, and `lib/langchain/chat-agent.test.ts`: validate chat booking confirmation requirements and current Racing Simulator service assumptions.
- `app/admin/dashboard-data.test.ts` and `app/api/analytics-chat/snapshot.test.ts`: validate downstream admin/analytics assumptions about `seats_booked`, service names, and derived revenue.
- `package.json` currently enumerates the test files explicitly in `pnpm test`, so later phases that add tests must update this script (`package.json:8`).

## Downstream Updates Required

- Phase 1 should introduce an explicit domain contract for resource kind/selection mode instead of using `total_seats === 16`, while preserving legacy `total_seats`, `seats_booked`, and `seat_labels` response fields during migration.
- Phase 2 must change both `supabase/base-schema.sql` and `supabase/security-hardening.sql` if generic resource labels are introduced; the duplicated `service_seat_maintenance_label_check` and `replace_service_seat_maintenance` numeric `RS` ordering are hard blockers.
- Phase 3 must preserve fallback behavior for legacy bookings with missing `seat_labels`, maintenance no-double-counting, exact-seat conflict checks for racing, count-only capacity for PS5, and one-hour same-start-time conflict semantics unless explicitly changed.
- Phase 5 should replace the 16-seat frontend switch with a selection-mode contract and decide how to render generic resource layouts without breaking the current Racing Simulator two-island layout or PS5 numeric input.
- Phase 6 should update chat prompts, LangChain tool descriptions, analytics pricing/service-name assumptions, admin maintenance filters, and reports if services become generic or resource labels are no longer `RS1`-`RS16`.
