# Phase 7: Current Frontend Migration

## Purpose

Turn the current Project Play Next.js app into the first consumer frontend for
the standalone backend platform. The UI, route structure, visual components,
and user-facing flow stay in this repository. Reservation backend internals,
database queries, Supabase RPCs, availability rules, lifecycle rules, resource
maintenance rules, and optional chat orchestration move behind the Phase 1/4
`/v1` API or SDK contracts.

This phase is a migration planning and decomposition pass. Future implementation
subagents should use this document to wire the current app to the backend
platform without redesigning the UI.

## Subagent Mission

Migrate this app from owning reservation backend behavior to consuming:

```text
GET /v1/metadata
GET /v1/services
GET /v1/services/{service_id}
GET /v1/venues
GET /v1/venues/{venue_id}
GET /v1/resources
GET /v1/resource-layouts/{layout_id}
GET /v1/availability
POST /v1/reservations
GET /v1/reservations
GET /v1/reservations/{reservation_id}
PATCH /v1/reservations/{reservation_id}
POST /v1/reservations/{reservation_id}/cancel
GET /v1/resource-maintenance
POST /v1/resource-maintenance
POST /v1/resource-maintenance/{maintenance_id}/end
POST /v1/chat/reservation-sessions
POST /v1/chat/reservation-sessions/{chat_session_id}/messages
POST /v1/chat/reservation-sessions/{chat_session_id}/confirm
```

or equivalent SDK methods from
[contracts/sdk-method-list.md](contracts/sdk-method-list.md).

Current `app/api/**` reservation routes become migration shims/proxies while
the UI still calls legacy paths. They are not the canonical backend source.

## Upstream Dependencies

- Phase 1 backend platform contract.
- Phase 2 backend repo shape.
- Phase 3 domain service extraction.
- Phase 4 API and SDK contract.
- Phase 5 database ownership strategy.
- Phase 6 AI chat contract, if chat is enabled.
- Contract docs:
  - [API Resource List](contracts/api-resource-list.md)
  - [SDK Method List](contracts/sdk-method-list.md)
  - [Error Conventions](contracts/error-conventions.md)
  - [Idempotency Conventions](contracts/idempotency-conventions.md)

## Allowed Write Scope

Future implementation pass in this current app:

- Frontend platform client layer and adapter tests.
- Current `app/api/**` reservation/chat/catalog/maintenance migration shims
  while the UI still calls legacy routes.
- Data-source wiring in booking form, admin reservation, maintenance,
  services/venues/catalog, and chat booking flows.
- Tests for migrated flows.

Planning-only pass:

- `docs/package-refactor/backend-platform-extraction/phase-7-current-frontend-migration.md`
- New frontend migration planning docs under
  `docs/package-refactor/backend-platform-extraction/`

Do not redesign UI. Do not move React components into the backend platform. Do
not edit downstream phase files unless this phase changes shared API, SDK,
tenant, database, or chat assumptions.

## Boundary Rules

- Frontend UI remains here and unchanged except future data source/client
  wiring.
- The backend platform API is the source of truth; the SDK is optional and must
  mirror direct HTTP.
- Current `app/api/availability`, `app/api/bookings`,
  `app/api/bookings/[id]`, `app/api/services`, `app/api/venues`,
  `app/api/seat-maintenance`, and `app/api/chat` stay only as compatibility
  shims until callers move to `/v1` or SDK methods.
- Frontend code must not access raw Supabase reservation tables, reservation
  items, resource maintenance tables, reservation RPCs, or backend-owned
  catalog tables long term.
- Admin auth/session UX can stay in this app, but reservation reads/writes must
  go through backend platform admin-capable APIs.
- Content/CMS, analytics/report UI, marketing pages, and visual components are
  outside this phase unless they depend on migrated reservation data.
- Missing backend capabilities are blockers. Do not silently reimplement
  missing reservation, availability, lifecycle, maintenance, or chat logic in
  frontend code.

## Current Surface Inventory

| Current surface | Current route/client | Long-term platform contract | Migration stance |
| --- | --- | --- | --- |
| Booking services | `components/form/ServiceSelector.tsx` calls `/api/services`; admin maintenance also calls `/api/services` | `GET /v1/services`, `GET /v1/resources`, `GET /v1/resource-layouts/{layout_id}` or SDK `listServices`, `listResources`, `getResourceLayout` | Keep `/api/services` as a shim that returns legacy `Service` fields until UI adapters are moved. |
| Availability | `components/form/TimeSlotSelector.tsx` calls `/api/availability?service_id&date` | `GET /v1/availability` or SDK `listAvailability` | Shim must translate legacy query and response fields. |
| Form booking create | `components/form/MultiStepForm.tsx` posts `/api/bookings` | `POST /v1/reservations` or SDK `createReservation` | Shim must translate legacy booking payload into `CreateReservationInput` with idempotency. |
| Admin reservation list/search | `app/admin/page.tsx`, `app/admin/AdminDashboard.tsx`, `/api/bookings?search=...`, and direct browser Supabase reads | `GET /v1/reservations` or SDK `listReservations` | Direct Supabase reservation reads must be removed during migration. |
| Admin status updates/cancel/restore | `AdminDashboard.tsx` updates `bookings` directly through browser Supabase; `/api/bookings/[id]` supports `PUT`/`DELETE` | `PATCH /v1/reservations/{reservation_id}` and `POST /v1/reservations/{reservation_id}/cancel` | Move through platform lifecycle APIs. Restore/completed transitions are backend lifecycle requirements or blockers. |
| Seat/resource maintenance | `SeatMaintenanceManager.tsx` calls `/api/seat-maintenance`; route uses `service_seat_maintenance` and `replace_service_seat_maintenance` | `GET /v1/resource-maintenance`, `POST /v1/resource-maintenance`, `POST /v1/resource-maintenance/{maintenance_id}/end` | Keep legacy route/field names as shim only. |
| Venues/catalog | `app/api/venues/**` reads Supabase `venues` | `GET /v1/venues`, `GET /v1/venues/{venue_id}` | Shim if UI still expects legacy venue rows. Project Play venue copy remains frontend/tenant config. |
| Chat booking UI | `components/chat/useChat.ts` calls the frontend-owned chat client wrapper, which can preserve legacy `/api/chat` mode or call `/api/v1/chat/reservation-sessions/**` in platform mode | Optional `/v1/chat/**` or SDK `client.chat.*` | Chat UI remains here; the wrapper adapts platform responses into the current `{ content, threadId, action }` shape. |

## Backend Feature Readiness Checklist

Future subagents must verify these backend platform features exist before
removing local reservation internals:

- `GET /v1/metadata` reports API version, minimum schema version, and optional
  chat module state.
- Catalog endpoints return services, resources, resource layouts, venue context,
  `total_quantity`, resource selection metadata, reservation policy, active
  resources, and public metadata needed by the current service picker and seat
  map.
- Availability endpoint returns slots with `start_at`/`end_at`,
  `available_quantity`, resource availability, taken resources, maintenance
  resources, and enough metadata to preserve current `timeSlots`.
- Reservation create endpoint supports idempotent atomic create and maps
  Project Play form payloads for Racing Simulator assigned resources and PS5
  quantity booking.
- Reservation list/read/update/cancel endpoints support admin search, filters,
  status display, completion, cancellation, and any restore behavior currently
  exposed by the UI.
- Resource maintenance endpoints support listing, replacing/toggling active
  resource blocks, reasons, actor/audit metadata, and Racing Simulator RS1-RS16
  compatibility through tenant resource config.
- Optional chat endpoints support session create/message/confirm or return
  `chat_module_disabled` with the Phase 1 error shape.
- Platform errors use stable codes and details so this app can map them to
  existing alerts, fallback states, and familiar copy.

If any item is missing, document it as a blocker in the future implementation
handoff. Do not replace it with frontend Supabase queries or copied RPC logic.

## Environment Variables

### Current App Consumer Configuration

| Variable | Required when | Purpose |
| --- | --- | --- |
| `RESERVATION_PLATFORM_BASE_URL` | Platform API mode | Server-side base URL for the standalone backend API, for example `https://api.example.com`. |
| `RESERVATION_PLATFORM_API_VERSION` | Optional | API version prefix; default `v1`. |
| `RESERVATION_PLATFORM_TENANT_ID` | When tenant is not inferred from auth | Tenant context sent by server shims/client. |
| `RESERVATION_PLATFORM_VENUE_ID` | When venue is not inferred from auth | Project Play venue context sent by server shims/client. |
| `RESERVATION_PLATFORM_API_KEY` | Server-to-server shim mode | Service credential for current app API shims. Must never be exposed to the browser. |
| `RESERVATION_PLATFORM_AUTH_MODE` | Optional | One of `server-api-key`, `forward-user-token`, or `disabled`; controls how shims attach auth. |
| `RESERVATION_PLATFORM_USE_SDK` | Optional | Enables SDK client construction instead of direct HTTP if the SDK is installed. |
| `RESERVATION_PLATFORM_LEGACY_API_SHIMS` | During migration | Enables legacy `/api/*` shims. Default should be enabled until UI callers move. |
| `RESERVATION_PLATFORM_DIRECT_API_CLIENT` | Optional late stage | Allows browser/server UI fetchers to call `/v1` directly where credentials and CORS policy permit. |
| `RESERVATION_PLATFORM_CHAT_STREAMING` | Optional | Enables streaming only after current chat UI is adapted for stream events. |
| `NEXT_PUBLIC_RESERVATION_CHAT_MODE` | Optional frontend chat client migration | Browser-safe switch for the current chat hook: `local` keeps legacy `/api/chat`, `platform` calls `/api/v1/chat/reservation-sessions/**` through the frontend-owned wrapper. Defaults to `local`. |
| `NEXT_PUBLIC_RESERVATION_TENANT_ID` | Optional frontend platform mode | Browser-safe tenant context hint sent as `X-Reservation-Tenant-Id` by platform chat/front-end platform mode. Do not use it as a secret or authorization boundary. |
| `NEXT_PUBLIC_RESERVATION_VENUE_ID` | Optional frontend platform mode | Browser-safe venue context hint sent as `X-Reservation-Venue-Id` by platform chat/front-end platform mode. Do not use it as a secret or authorization boundary. |
| `RESERVATION_PLATFORM_TIMEOUT_MS` | Optional | Request timeout for platform calls. |
| `RESERVATION_PLATFORM_RETRY_MODE` | Optional | Retry policy for safe GETs only; mutation retries must respect idempotency. |

Terminology:

- Compatibility proxy shims are legacy `/api/*` routes that translate current
  UI requests to `/v1` or SDK calls and return legacy response shapes.
- Legacy Supabase fallback is temporary rollback code that calls existing
  Supabase reservation logic only when an explicit fallback flag is enabled.
  Fallback must be logged, time-boxed, and excluded from acceptance checks.

### Transitional Legacy Configuration

Keep only while compatibility shims or non-reservation app areas still require
them:

| Variable | Current use | Retirement condition |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Current Supabase browser/server clients, auth, content, analytics, and legacy reservation routes | Reservation flows no longer use it directly; may remain for auth/content/analytics if those stay app-owned. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Current browser Supabase and public reads | Reservation browser access no longer uses raw Supabase tables. |
| `SUPABASE_SERVICE_ROLE_KEY` | Current server reservation/chat routes and atomic create | Reservation shims no longer call Supabase/RPC directly. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Current host AI/provider setup | Chat backend module or host adapter decides provider ownership. |
| `OPENROUTER_API_KEY` | Current host AI/provider setup | Chat route no longer runs host-owned booking workflow, unless backend chat is disabled and legacy fallback is explicitly active. |

Do not add `NEXT_PUBLIC_` platform API keys. Browser-visible configuration may
include only non-secret base URLs, version, tenant hints, and feature flags.

## Target Client Layer

Future implementation should add a small platform integration layer in this app
before touching UI callers.

Target files:

```text
lib/platform/
  config.ts
  client.ts
  errors.ts
  idempotency.ts
  adapters/
    services.ts
    availability.ts
    reservations.ts
    resource-maintenance.ts
    chat.ts
  tests/
    config.test.ts
    adapters.test.ts
    reservations.test.ts
    availability.test.ts
```

Responsibilities:

- Read and validate environment variables.
- Construct either the SDK client or a direct HTTP client for `/v1`.
- Attach tenant, venue, auth, correlation, and idempotency headers.
- Normalize `PlatformError` into the existing app's `jsonError` shape for
  legacy route shims.
- Translate canonical platform payloads into legacy UI shapes only in
  `lib/platform/adapters/**` or `app/api/**` shims.
- Generate explicit idempotency keys per user mutation intent. Never reuse a
  key across distinct bookings, cancels, status updates, maintenance saves, or
  chat confirmations.
- Avoid importing `lib/supabase*`, reservation table names, RPC names, or
  backend package internals.

## Compatibility Field Mapping

The current UI expects legacy fields. Preserve them through adapters until the
UI is intentionally migrated to canonical names.

| Legacy app field | Platform field | Notes |
| --- | --- | --- |
| `service.id` | `service_id` | Preserve `id` alias for current `Service` type. |
| `service.total_seats` | `total_quantity` | PS5 quantity capacity and Racing Simulator capacity must remain visually unchanged. |
| `resource_kind`, `selection_mode`, `reservation_policy` | Same or service/resource metadata | Preserve values used to choose Racing vs PS5 picker behavior. |
| `resources`, `layout` | `GET /v1/resources`, `GET /v1/resource-layouts/{layout_id}` | Adapter may hydrate these onto service objects until UI fetchers split catalog calls. |
| `timeSlots[].start_time` / `end_time` | `slots[].start_at` / `end_at` | Preserve current local time display and midnight rollover behavior. |
| `timeSlots[].available_seats` | `available_quantity` | Keep label "seats left" in UI unless a future UI copy change is scoped. |
| `timeSlots[].taken_seat_labels` | unavailable/taken `resource_labels` | Required by `SeatMap`. |
| `timeSlots[].maintenance_seat_labels` | maintenance resource labels | Required by `SeatMap`. |
| `seats_booked` | `quantity` | Preserve for form and admin table display. |
| `seat_labels` | `reservation_items[].resource_label` or `resource_labels` | Required for Racing Simulator selected RS labels. |
| `booking_date`, `start_time`, `end_time` | `start_at`, `end_at` | Adapter owns conversion with Project Play timezone/venue config. |
| `user_name`, `user_email`, `user_phone` | `customer.name`, `customer.email`, `customer.phone` | Preserve current validation and admin display. |
| `interface_type` | `source` or metadata | Preserve `form` and `chat` source semantics. |
| `/api/seat-maintenance` `seat_labels` | resource maintenance labels | Route name and response stay legacy until UI moves. |
| `/api/chat` `threadId` | `chat_session_id` | Adapter preserves `threadId` for current hook. |
| `/api/chat` `action` | `ChatMessageResponse.actions[]` with `reservation_intent_id` where confirmation is available | Adapter maps backend actions to current `BookingCard` data. |

## Migration Stages

### Stage 7.1: Baseline And Inventory Lock

Scope:

- Capture current behavior for Racing Simulator and Playstation 5 booking.
- Record current legacy payloads for services, availability, booking create,
  admin list/search/status update, maintenance, and chat.
- Add characterization tests where missing before rewiring.

Write targets:

- `app/api/**/route.test.ts` for shim characterization.
- `components/form/**.test.tsx` only when existing component-level coverage is
  needed for data shape adapters.
- New planning notes under this folder if an implementation blocker is found.

Acceptance:

- Current `/api/services`, `/api/availability`, `/api/bookings`,
  `/api/bookings/[id]`, `/api/seat-maintenance`, and `/api/chat` response
  shapes are documented by tests or fixtures.
- Racing Simulator RS1-RS16 and PS5 quantity-only behavior are explicitly
  covered.

### Stage 7.2: Platform Client Layer

Scope:

- Add `lib/platform/**`.
- Support SDK mode and direct HTTP mode.
- Add error, idempotency, tenant, venue, timeout, and auth header handling.
- Keep the client server-safe by default; expose browser calls only when the
  backend platform supports public CORS/auth for that route.

Write targets:

- `lib/platform/config.ts`
- `lib/platform/client.ts`
- `lib/platform/errors.ts`
- `lib/platform/idempotency.ts`
- `lib/platform/tests/**`

Acceptance:

- Client can call `GET /v1/metadata` in tests with a fake fetch.
- Missing platform configuration fails gracefully and keeps legacy shims
  available when `RESERVATION_PLATFORM_LEGACY_API_SHIMS` is enabled.
- Mutation helpers require explicit idempotency keys.

### Stage 7.3: Legacy API Shims

Scope:

- Convert reservation-related `app/api/**` routes into proxy/shim endpoints.
- Keep legacy route names and response shapes for current UI.
- Remove direct Supabase reservation table/RPC usage from these routes after
  platform equivalents are ready.

Route targets:

| Current route | Platform call | Shim requirement |
| --- | --- | --- |
| `GET /api/services` | `GET /v1/services` plus optional resources/layouts | Return legacy array with `id`, `total_seats`, metadata, `resources`, and `layout`. |
| `GET /api/services/[id]` | `GET /v1/services/{service_id}` | Return one legacy service row. |
| `GET /api/venues` | `GET /v1/venues` | Return legacy venue array if current pages still consume it. |
| `GET /api/venues/[id]` | `GET /v1/venues/{venue_id}` | Return legacy venue row. |
| `GET /api/availability` | `GET /v1/availability` | Convert `service_id` and `date` into date range/quantity query; return `timeSlots` and legacy seat metadata. |
| `GET /api/bookings` | `GET /v1/reservations` | Preserve admin search query, ordering, and `services(name)` compatibility shape. |
| `POST /api/bookings` | `POST /v1/reservations` | Convert form/chat payload to `CreateReservationInput`; require/generate per-submit idempotency. |
| `GET /api/bookings/[id]` | `GET /v1/reservations/{reservation_id}` | Preserve legacy booking object. |
| `PUT /api/bookings/[id]` | `PATCH /v1/reservations/{reservation_id}` or lifecycle endpoint | Preserve admin status/customer update behavior if backend supports it. |
| `DELETE /api/bookings/[id]` | `POST /v1/reservations/{reservation_id}/cancel` | Preserve `{ message: "Booking cancelled", data }`. |
| `GET /api/seat-maintenance` | `GET /v1/resource-maintenance` | Return `{ seats: [{ seat_label, reason, ... }] }`. |
| `PUT /api/seat-maintenance` | `POST /v1/resource-maintenance` and `POST /v1/resource-maintenance/{maintenance_id}/end`, or a future bulk replace endpoint if Phase 4 adds one | Preserve replace-all behavior by diffing active blocks: list current blocks, create newly selected labels or selected labels whose reason changed with one idempotency key per block, end deselected active blocks with one idempotency key per block, and block implementation if the backend cannot represent replace-all safely. |
| `POST /api/chat` | `/v1/chat/**` or SDK chat namespace | Preserve current `{ content, threadId, action }` response. |

Acceptance:

- Current UI can keep calling `/api/*` without behavior changes.
- Shims do not call raw Supabase reservation tables/RPCs when platform mode is
  enabled.
- If the platform is unavailable and fallback is enabled, the route uses legacy
  code only as a temporary rollback path and logs/flags the fallback.

### Stage 7.4: Booking Form Flow

Scope:

- Keep `app/form-booking/page.tsx` and `components/form/**` visual behavior.
- Prefer moving data fetchers to `lib/platform` adapters or direct SDK/API
  calls only after shims are stable.
- Preserve service selection, date/time selection, Racing Simulator seat map,
  PS5 quantity input, customer form, review, success ticket, and existing alert
  behavior.

Write targets:

- `components/form/ServiceSelector.tsx` data source wiring only, if moving off
  `/api/services`.
- `components/form/TimeSlotSelector.tsx` data source wiring only, if moving off
  `/api/availability`.
- `components/form/MultiStepForm.tsx` submit wiring only, if moving off
  `/api/bookings`.
- Adapter tests for service, availability, and create payloads.

Acceptance:

- Racing Simulator still requires selected RS resources when configured as
  assigned-resource or hybrid with required labels.
- PS5 remains quantity-only and defaults to one seat/unit.
- Availability still disables full slots and passes taken/maintenance labels
  to `SeatMap`.
- Create errors still show familiar messages for invalid data, insufficient
  capacity, maintenance conflict, and resource conflict.
- Form create does not query Supabase or call atomic RPC directly.

### Stage 7.5: Admin Reservation Flow

Scope:

- Replace reservation admin direct Supabase reads/writes with platform
  reservation APIs.
- Keep admin UI layout, filters, status chips, search box, refresh behavior,
  and action buttons.
- Preserve or explicitly block restore behavior if the backend lifecycle
  contract does not allow cancelled/completed to confirmed.

Write targets:

- `app/admin/page.tsx` server data loading.
- `app/admin/AdminDashboard.tsx` refresh/search/status update wiring only.
- `app/admin/dashboard-data.ts` only for data shape adapters if needed.
- `app/api/bookings/**` shims until UI calls platform directly.

Acceptance:

- Admin list/search uses `GET /v1/reservations`.
- Status updates use `PATCH /v1/reservations/{reservation_id}` or lifecycle
  endpoints with idempotency.
- Cancel uses `POST /v1/reservations/{reservation_id}/cancel`.
- Browser code no longer reads or writes the `bookings` table directly.
- If backend cannot support current restore/completed transitions, document the
  lifecycle blocker before changing UI behavior.

### Stage 7.6: Maintenance Flow

Scope:

- Migrate `SeatMaintenanceManager` through resource maintenance APIs.
- Keep current page title, RS island layout, generic resource grid, reason
  field, save button, and error copy.
- Preserve legacy route name until UI wiring changes.

Write targets:

- `app/api/seat-maintenance/route.ts` shim.
- `components/admin/SeatMaintenanceManager.tsx` data source wiring only, if
  moving off `/api/seat-maintenance`.
- `lib/platform/adapters/resource-maintenance.ts`.

Acceptance:

- Racing Simulator RS1-RS16 maintenance behavior is preserved.
- Generic assigned resources can be blocked without RS normalization.
- PS5 or quantity-only services without configured resources are not offered as
  resource-maintenance services unless backend config supports them.
- Maintenance affects availability after save.
- Frontend no longer calls `service_seat_maintenance` or
  `replace_service_seat_maintenance`.

### Stage 7.7: Services, Venues, And Catalog Flow

Scope:

- Move service, venue, resource, and layout reads to platform catalog APIs.
- Keep Project Play copy and presentation in this app.
- Hydrate legacy `Service` objects until components are migrated to canonical
  `Service`, `Resource`, and `ResourceLayout` types from the SDK/API.

Write targets:

- `app/api/services/**` shims.
- `app/api/venues/**` shims.
- `lib/platform/adapters/services.ts`.
- `lib/platform/adapters/availability.ts` for layout/resource metadata.

Acceptance:

- Service cards still display Racing Simulator and Playstation 5 names,
  descriptions, icons, and capacity.
- Resource metadata still drives assigned-resource vs quantity-only behavior.
- Venue reads no longer query raw Supabase venue tables for backend-owned
  catalog fields.
- Missing catalog fields needed by the UI are documented as backend blockers.

### Stage 7.8: Chat Booking Flow

Scope:

- Keep `app/chat-booking/page.tsx` and `components/chat/**` visual behavior.
- Use the frontend-owned chat client wrapper to choose legacy `/api/chat` mode
  or platform `/api/v1/chat/reservation-sessions/**` mode through
  `NEXT_PUBLIC_RESERVATION_CHAT_MODE`.
- Preserve current non-streaming hook behavior first. Streaming is a separate
  opt-in after the UI can consume stream events.

Write targets:

- `lib/reservation-chat-client.ts` frontend-owned wrapper.
- `lib/reservation-chat-client.test.ts`.
- `components/chat/useChat.ts` only for data source wiring through the wrapper.

Legacy mapping:

- First user message with no `threadId` creates or resumes a backend chat
  session, then sends the message.
- Existing `threadId` maps to `chat_session_id`.
- Backend `ChatAction` with `reservation_confirmation` maps to current
  `BookingData`/`BookingCard` action.
- Current `confirmBooking` request maps to
  `POST /v1/chat/reservation-sessions/{chat_session_id}/confirm` where
  available.
- If chat module is disabled, route returns the current friendly error or
  fallback copy while preserving the Phase 1 `chat_module_disabled` details for
  logs/tests.

Acceptance:

- Chat UI can still ask about services, availability, policy, and booking.
- Final booking is created only after the user confirms the booking card.
- Chat confirmation uses core reservation creation through backend chat/API,
  not direct frontend Supabase or duplicated booking logic.
- Disabled platform chat returns friendly copy from the wrapper without sending
  a follow-up message request.
- If `/v1/chat` is not implemented, the missing backend chat feature is
  documented as a blocker or the legacy chat fallback remains explicitly
  feature-flagged.

### Stage 7.9: Retire Legacy Reservation Internals

Scope:

- Remove legacy reservation backend dependencies from current app only after
  every migrated flow passes verification.
- Keep Supabase helpers only for app-owned auth/content/analytics surfaces if
  those remain outside the backend platform.

Retirement candidates:

- Reservation direct reads/writes from `lib/supabase*` in booking/admin flows.
- `lib/reservations/**` imports from UI-facing paths.
- Direct imports of `@project-play/reservations-core` and
  `@project-play/reservations-supabase` from `app/api/**` shims.
- Direct chat booking persistence in `lib/langchain/chat-agent.ts` when backend
  chat is enabled.

Acceptance:

- Reservation flows compile and run without this app owning backend internals.
- Legacy route shims can be deleted only after no UI caller depends on them.
- Any remaining legacy fallback is documented, feature-flagged, and time-boxed.

## Fallback And Rollback Plan

Migration must be reversible per flow.

- Keep `RESERVATION_PLATFORM_LEGACY_API_SHIMS=true` until all flows are stable.
- Add per-surface fallback flags if needed:
  `RESERVATION_PLATFORM_FALLBACK_CATALOG`,
  `RESERVATION_PLATFORM_FALLBACK_AVAILABILITY`,
  `RESERVATION_PLATFORM_FALLBACK_RESERVATIONS`,
  `RESERVATION_PLATFORM_FALLBACK_MAINTENANCE`, and
  `RESERVATION_PLATFORM_FALLBACK_CHAT`.
- Fallback may call existing legacy code only during migration and only from
  server routes. Browser code must not gain new raw Supabase reservation access.
- Log or expose diagnostics when a fallback is used so production does not
  silently drift back to frontend-owned backend logic.
- Roll back by switching the affected feature flag to legacy shims, not by
  reverting unrelated UI changes.
- Do not allow fallback to mask missing backend features in acceptance checks.
  Blockers must be listed in the handoff notes.

## Known Direct Supabase Call Sites

Future implementation subagents should audit and migrate at least these
reservation-related direct Supabase surfaces:

- `app/admin/page.tsx`: server-side `bookings` reads for dashboard preload.
- `app/admin/AdminDashboard.tsx`: browser-side `bookings` refresh/update
  behavior.
- `app/api/availability/route.ts`: direct reads of `services`, `bookings`,
  `service_seat_maintenance`, `reservable_resources`, and `resource_layouts`.
- `app/api/seat-maintenance/route.ts`: `service_seat_maintenance` reads and
  `replace_service_seat_maintenance` RPC calls.
- `app/api/bookings/**`: booking create/list/read/update/cancel Supabase
  access and RPC compatibility behavior.
- `app/api/chat/route.ts` and `lib/langchain/chat-agent.ts`: host-owned chat
  booking logic and direct reservation/catalog/maintenance access.

## Verification Plan

Preconditions for repeatable verification:

- Project Play compatibility tenant/venue fixture is available in the backend
  platform environment.
- Racing Simulator has configured resources `RS1` through `RS16` and assigned-
  resource booking policy.
- PS5/Playstation 5 has quantity-only booking capacity and does not require
  resource labels.
- Admin test account or server-to-server admin credential can list, update,
  cancel, and manage maintenance through platform APIs.
- Verification logs should show whether proxy shims or legacy Supabase
  fallbacks were used; acceptance must pass with fallback disabled.

### Automated Tests

Run or add focused tests for:

- Platform client config, auth headers, tenant/venue context, timeout, error
  mapping, and idempotency key handling.
- Service adapter maps `total_quantity` to `total_seats`, preserves resources,
  layout, selection mode, and policy.
- Availability adapter maps `slots` to `timeSlots`, preserves
  `available_seats`, `taken_seat_labels`, `maintenance_seat_labels`, and
  Project Play local time display.
- Reservation create adapter maps form/chat payloads to `CreateReservationInput`
  and preserves errors for insufficient capacity, resource conflict,
  maintenance conflict, invalid customer, invalid quantity, and invalid slot.
- Admin list/search/status/cancel adapters preserve existing `AdminBooking`
  shape and service relation display.
- Resource maintenance adapter preserves replace-all behavior and RS label
  compatibility.
- Chat adapter preserves `threadId`, `content`, booking confirmation actions,
  cancellation, and booking success response.

### Manual Flow Verification

Use the existing app UI after each migration stage:

- Racing Simulator form booking:
  - Select Racing Simulator.
  - Pick a date/time with available resources.
  - Select one or more RS labels on the seat map.
  - Submit customer details.
  - Confirm success ticket still shows service/date/time/seats/customer.
  - Verify selected resources are no longer available for the same slot.
- Racing Simulator maintenance:
  - Open admin seat maintenance.
  - Block an RS label.
  - Verify it appears as maintenance in the booking seat map.
  - Unblock it and verify availability returns.
- PS5 form booking:
  - Select Playstation 5.
  - Pick date/time.
  - Enter quantity through the number input, not seat map.
  - Submit and verify capacity decreases without requiring resource labels.
- Admin reservation flow:
  - Load dashboard.
  - Refresh reservations.
  - Search by name/email/phone.
  - Mark confirmed reservation completed.
  - Cancel a confirmed reservation.
  - Restore only if the backend lifecycle contract supports it.
- Services/venues/catalog:
  - Service cards retain names, descriptions, icons, capacity, and fallback
    under-maintenance behavior when catalog fails.
  - Venue-dependent pages or API consumers still receive expected data.
- Chat booking:
  - Ask for available services.
  - Ask for availability.
  - Receive a booking confirmation card.
  - Confirm the card.
  - Verify the reservation appears in admin and affects availability.
  - Cancel the card before confirmation and verify no reservation is created.

### Build And Regression Commands

Future implementation subagents should run these commands from the repository
root after code changes:

```powershell
pnpm lint
pnpm test
pnpm build
```

`pnpm lint` checks ESLint/TypeScript conventions and is safe for this repo.
`pnpm test` runs the configured Node test suite and is safe; it should not
modify source files. `pnpm build` creates a production build in the local build
output and is safe, but it can reveal missing environment variables.

## Migration Checklist

- [ ] Baseline current legacy API response fixtures and behavior tests.
- [ ] Add `lib/platform` config/client/error/idempotency layer.
- [ ] Add catalog adapters for services, venues, resources, and layouts.
- [ ] Convert `/api/services` and `/api/venues` to platform shims.
- [ ] Add availability adapter and convert `/api/availability` to platform shim.
- [ ] Add reservation create adapter and convert `POST /api/bookings`.
- [ ] Add admin reservation list/read adapter and convert `GET /api/bookings`.
- [ ] Add reservation lifecycle adapter and convert `/api/bookings/[id]`.
- [ ] Remove browser Supabase reservation reads/writes from admin dashboard.
- [x] Add resource maintenance adapter and convert `/api/seat-maintenance`
  reads/saves through the frontend platform wrapper.
- [ ] Add optional chat wrapper platform mode using
  `NEXT_PUBLIC_RESERVATION_CHAT_MODE`.
  Frontend-owned `lib/reservation-chat-client.ts` now lets the current hook
  choose legacy `/api/chat` or disabled-safe `/api/v1/chat/reservation-sessions/**`
  direct calls with tenant/venue, correlation, and idempotency headers.
- [ ] Move form/admin/maintenance/chat fetchers from legacy `/api/*` routes to
  direct platform client only after shims are stable.
- [ ] Verify Racing Simulator assigned-resource booking and maintenance.
- [ ] Verify PS5 quantity-only booking.
- [ ] Verify admin search, status update, cancel, and supported restore.
- [ ] Verify chat prepared booking and confirmation.
- [ ] Disable or remove legacy reservation fallback after all migrated flows
  pass.
- [ ] Document backend blockers instead of reimplementing missing logic in
  frontend code.

## Implementation Slices For Future Subagents

### Slice 7.1: Characterization And Fixtures

Write targets:

- `app/api/availability/route.test.ts`
- `app/api/bookings/route.test.ts`
- `app/api/bookings/[id]/route.test.ts`
- `app/api/seat-maintenance/route.test.ts`
- `app/api/chat/route.test.ts`
- Optional fixtures under
  `docs/package-refactor/backend-platform-extraction/phase-7-fixtures/`

Acceptance:

- Tests or fixtures capture legacy payloads for the current UI.
- Racing Simulator and PS5 behavior are explicitly represented.

### Slice 7.2: Platform Client And Adapters

Write targets:

- `lib/platform/**`

Acceptance:

- Fake-fetch tests cover `/v1` calls, headers, errors, and idempotency.
- No Supabase imports exist in `lib/platform/**`.

### Slice 7.3: Catalog And Availability Shims

Write targets:

- `app/api/services/**`
- `app/api/venues/**`
- `app/api/availability/route.ts`
- `lib/platform/adapters/services.ts`
- `lib/platform/adapters/availability.ts`

Acceptance:

- Current form and maintenance UI load service/resource/layout metadata through
  shims.
- Availability preserves current slot shape and resource labels.

### Slice 7.4: Reservation Create And Form Flow

Write targets:

- `app/api/bookings/route.ts`
- `lib/platform/adapters/reservations.ts`
- `components/form/MultiStepForm.tsx` only if direct client wiring is scoped.

Acceptance:

- Form booking creates through `/v1/reservations` or SDK
  `createReservation`.
- Legacy create errors remain familiar.

### Slice 7.5: Admin Reservation Migration

Write targets:

- `app/admin/page.tsx`
- `app/admin/AdminDashboard.tsx`
- `app/api/bookings/route.ts`
- `app/api/bookings/[id]/route.ts`
- `app/admin/dashboard-data.ts` only for data shape adapters.

Acceptance:

- Admin dashboard no longer reads/writes reservation tables directly from the
  browser.
- Unsupported lifecycle transitions are documented as backend blockers.

### Slice 7.6: Maintenance Migration

Write targets:

- `app/api/seat-maintenance/route.ts`
- `components/admin/SeatMaintenanceManager.tsx` only if direct client wiring is
  scoped.
- `lib/platform/adapters/resource-maintenance.ts`

Acceptance:

- Maintenance route uses `/v1/resource-maintenance`.
- RS and generic resource behavior are preserved.

### Slice 7.7: Chat Migration

Write targets:

- `app/api/chat/route.ts`
- `components/chat/useChat.ts` only if direct client wiring is scoped.
- `lib/platform/adapters/chat.ts`

Acceptance:

- Chat UI keeps current message/action behavior.
- Confirmation uses optional backend chat confirm or is blocked/fallback-gated
  when backend chat is not ready.

### Slice 7.8: Fallback Retirement

Write targets:

- `app/api/**` reservation/chat shim files.
- `lib/platform/**`
- Environment documentation.

Acceptance:

- Legacy reservation fallback flags are disabled.
- Remaining Supabase usage is limited to app-owned auth/content/analytics or
  explicitly documented non-platform areas.

## Blockers To Track

Document these in future handoffs if encountered:

- Backend API lacks a catalog field required by the current service picker,
  seat map, or maintenance page.
- Backend availability cannot return taken and maintenance resource labels.
- Backend reservation create cannot preserve Racing Simulator assigned-resource
  validation or PS5 quantity-only behavior.
- Backend list/search cannot support admin dashboard search by customer name,
  email, or phone.
- Backend lifecycle cannot support current completed/cancelled/restore actions.
- Backend resource maintenance cannot represent replace-all maintenance state
  for a service.
- Backend chat module is disabled or lacks prepared reservation confirmation.
- Backend auth/tenant strategy cannot safely support current admin sessions.

## Deliverables

- Migration checklist: [Migration Checklist](#migration-checklist).
- Environment variable list: [Environment Variables](#environment-variables).
- Updated app integration plan:
  [Target Client Layer](#target-client-layer),
  [Migration Stages](#migration-stages), and
  [Implementation Slices For Future Subagents](#implementation-slices-for-future-subagents).
- Verification notes for existing booking flows:
  [Verification Plan](#verification-plan).

## Acceptance Criteria

- Current app no longer needs to own reservation backend internals after the
  migration.
- UI behavior remains familiar to users.
- Racing Simulator and PS5 behavior are preserved.
- Current app `app/api/**` routes are migration shims/proxies where needed, not
  canonical backend source.
- Frontend does not access raw Supabase reservation tables/RPCs long term.
- Chat UI remains here and calls optional `/v1/chat` or SDK chat methods when
  enabled.
- Missing backend features are documented as blockers, not silently
  reimplemented in frontend code.

## Downstream Updates Required

No downstream phase updates are required from this planning pass because it
preserves the Phase 1 `/v1` API, Phase 4 SDK method list, Phase 5 database
ownership boundary, and Phase 6 optional chat endpoint assumptions.

If future implementation changes endpoint paths, SDK method names, required
environment variables, tenant/venue context, lifecycle support, idempotency
requirements, or chat behavior, update:

- `contracts/api-resource-list.md`
- `contracts/sdk-method-list.md`
- Phase 4 API/SDK contract
- Phase 5 database strategy if raw table/RPC assumptions change
- Phase 6 AI chat contract if chat endpoint or action shapes change
- Phase 8 external frontend proofs
- Phase 9 release/deployment/operations
