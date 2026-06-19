# Phase 4: API Layer and SDK Contract

## Purpose

Expose the backend platform through a stable `/v1` HTTP API and optional
TypeScript SDK that any frontend can consume without database access, current
Next.js route assumptions, Supabase RPC knowledge, or copied booking rules.

This phase is a planning and decomposition pass for future implementation
subagents. It does not edit application code in the current repository.

## Subagent Mission

Implement the Phase 1 API resources and SDK methods in the future backend repo:

```text
reservation-platform-backend/apps/api
reservation-platform-backend/packages/sdk
reservation-platform-backend/packages/contract-types
```

Local generated contract artifacts already exist in this repository at
`packages/contract-types/contracts/openapi.json` and
`packages/contract-types/contracts/json-schema/*.schema.json`. Those package
owned paths are the artifacts that would move with `packages/contract-types`
during future standalone backend extraction.

The HTTP API is the source of truth. The SDK mirrors direct HTTP behavior,
exports typed helpers, and must not contain reservation rules that can diverge
from API/domain behavior.

## Upstream Dependencies

- Phase 1 platform contract.
- Phase 1 contract docs:
  - `contracts/api-resource-list.md`
  - `contracts/sdk-method-list.md`
  - `contracts/error-conventions.md`
  - `contracts/idempotency-conventions.md`
- Phase 2 backend repo shape.
- Phase 3 domain service extraction.

## Allowed Write Scope

Future implementation pass:

- Backend API route, middleware, application service, and route test files under
  `reservation-platform-backend/apps/api`.
- SDK package files under `reservation-platform-backend/packages/sdk`.
- Shared contract type and schema files under
  `reservation-platform-backend/packages/contract-types`.
- Local OpenAPI and JSON Schema artifacts under
  `packages/contract-types/contracts/openapi.json` and
  `packages/contract-types/contracts/json-schema/*.schema.json`; future
  standalone extraction should carry these package-owned artifacts with
  `packages/contract-types`.
- API/SDK tests.
- Docs in `docs/package-refactor/backend-platform-extraction/`.

Current planning-only pass:

- `docs/package-refactor/backend-platform-extraction/phase-4-api-layer-and-sdk-contract.md`
- New API/SDK implementation planning docs under
  `docs/package-refactor/backend-platform-extraction/`

Do not edit application code in this planning pass. Do not copy current
Next.js `app/api/**` route files verbatim into the backend platform.

## Boundary Rules

- API route handlers parse HTTP, authenticate callers, resolve tenant/venue
  context, enforce idempotency middleware, call application services, and
  serialize responses or Phase 1 errors.
- Application services orchestrate domain validation and persistence through
  storage ports/adapters. They load catalog/reservation/maintenance state
  through storage ports, call `packages/domain` validation/build-command
  functions, then ask a storage adapter to execute persistence.
- Domain services validate inputs, evaluate availability and lifecycle rules,
  and build commands. Domain services must not import DB clients, Supabase,
  table names, SQL, HTTP request objects, SDK clients, or optional chat modules.
- Application services map `packages/contract-types` DTOs to
  `packages/domain` command/result types. `packages/domain` must not import
  `packages/contract-types`; the dependency direction is API/SDK/contracts
  toward domain, never domain toward API payload schemas.
- Storage adapters execute database reads/writes and atomic reservation
  commands. They map rows to canonical contract types.
- Contract types and JSON schemas define payloads only. They do not contain
  booking rules.
- SDK methods call the `/v1` HTTP API. They may serialize query strings,
  attach headers, parse errors, and provide optional idempotency helpers, but
  must not reimplement availability, capacity, lifecycle, or maintenance rules.

## Target Repository Files

```text
reservation-platform-backend/
  apps/api/src/
    server.ts
    app.ts
    routes/
      metadata.ts
      tenants.ts
      venues.ts
      services.ts
      resources.ts
      resource-layouts.ts
      availability.ts
      reservations.ts
      reservation-lifecycle.ts
      resource-maintenance.ts
    application/
      metadata-service.ts
      catalog-service.ts
      availability-service.ts
      reservation-service.ts
      reservation-lifecycle-service.ts
      resource-maintenance-service.ts
    middleware/
      auth-context.ts
      tenant-context.ts
      correlation-id.ts
      idempotency.ts
      errors.ts
      validation.ts
    modules/
      chat/
        routes.ts
        application-service.ts
        schemas.ts
      payments/
        routes.ts
        schemas.ts
    openapi/
      v1.ts
    tests/
      api-contract.test.ts
      idempotency.test.ts
      error-shape.test.ts
      availability.routes.test.ts
      reservations.routes.test.ts
      reservation-lifecycle.routes.test.ts
      resource-maintenance.routes.test.ts
      chat.routes.test.ts
      payments.routes.test.ts

  packages/contract-types/src/
    index.ts
    schemas/
      common.ts
      metadata.ts
      tenant.ts
      venue.ts
      service.ts
      resource.ts
      resource-layout.ts
      availability.ts
      reservation.ts
      reservation-lifecycle.ts
      resource-maintenance.ts
      customer.ts
      errors.ts
      idempotency.ts
      chat.ts
      payment.ts
    types/
      api.ts
      metadata.ts
      tenant.ts
      venue.ts
      service.ts
      resource.ts
      resource-layout.ts
      availability.ts
      reservation.ts
      customer.ts
      errors.ts
      idempotency.ts
      chat.ts
      payment.ts

  packages/sdk/src/
    index.ts
    client.ts
    request.ts
    errors.ts
    idempotency.ts
    modules/
      metadata.ts
      tenants.ts
      venues.ts
      services.ts
      resources.ts
      resource-layouts.ts
      availability.ts
      reservations.ts
      resource-maintenance.ts
      chat.ts
      payments.ts
    tests/
      client.test.ts
      methods.test.ts
      errors.test.ts
      idempotency.test.ts
      direct-http-parity.test.ts

  packages/contract-types/contracts/
    openapi.json
    json-schema/
      common/
      requests/
      responses/
      errors/
    examples/
      availability-request.json
      availability-response.json
      create-reservation-request.json
      create-reservation-response.json
      reservation-error-resource-conflict.json
      cancel-reservation-request.json
      reschedule-reservation-request.json
      update-reservation-request.json
      resource-maintenance-create-request.json
      resource-maintenance-end-request.json
      chat-session-create-request.json
      chat-message-request.json
      chat-confirm-request.json
      payment-reference-create-request.json
      payment-reference-create-response.json
      payment-reference-read-response.json
```

## Core API Endpoints

All endpoints are versioned under `/v1`. Route files should use generic
reservation vocabulary from Phase 1.

| Endpoint | Route file | Validation schema | Application service | Required tests |
| --- | --- | --- | --- | --- |
| `GET /v1/metadata` | `routes/metadata.ts` | `schemas/metadata.ts` | `metadata-service.ts` | enabled modules, version, compatibility notices |
| `GET /v1/tenants/current` | `routes/tenants.ts` | `schemas/tenant.ts` | `catalog-service.ts` | tenant context required, disabled tenant |
| `GET /v1/venues` | `routes/venues.ts` | `schemas/venue.ts` | `catalog-service.ts` | visible venue filtering |
| `GET /v1/venues/{venue_id}` | `routes/venues.ts` | `schemas/venue.ts` | `catalog-service.ts` | not found, tenant isolation |
| `GET /v1/services` | `routes/services.ts` | `schemas/service.ts` | `catalog-service.ts` | filters by venue/resource kind |
| `GET /v1/services/{service_id}` | `routes/services.ts` | `schemas/service.ts` | `catalog-service.ts` | not found, disabled service |
| `GET /v1/resources` | `routes/resources.ts` | `schemas/resource.ts` | `catalog-service.ts` | filters by service/layout/status |
| `GET /v1/resources/{resource_id}` | `routes/resources.ts` | `schemas/resource.ts` | `catalog-service.ts` | not found, inactive resource visibility |
| `GET /v1/resource-layouts/{layout_id}` | `routes/resource-layouts.ts` | `schemas/resource-layout.ts` | `catalog-service.ts` | not found, tenant isolation |
| `GET /v1/availability` | `routes/availability.ts` | `schemas/availability.ts` | `availability-service.ts` | capacity, resource, maintenance, cancelled reservations |
| `POST /v1/reservations` | `routes/reservations.ts` | `schemas/reservation.ts` | `reservation-service.ts` | atomic create, conflicts, idempotency |
| `GET /v1/reservations/{reservation_id}` | `routes/reservations.ts` | `schemas/reservation.ts` | `reservation-service.ts` | auth scoping, not found |
| `GET /v1/reservations` | `routes/reservations.ts` | `schemas/reservation.ts` | `reservation-service.ts` | admin/customer filters, pagination |
| `POST /v1/reservations/{reservation_id}/cancel` | `routes/reservation-lifecycle.ts` | `schemas/reservation-lifecycle.ts` | `reservation-lifecycle-service.ts` | lifecycle rules, idempotency |
| `POST /v1/reservations/{reservation_id}/reschedule` | `routes/reservation-lifecycle.ts` | `schemas/reservation-lifecycle.ts` | `reservation-lifecycle-service.ts` | conflict re-check, idempotency |
| `PATCH /v1/reservations/{reservation_id}` | `routes/reservation-lifecycle.ts` | `schemas/reservation-lifecycle.ts` | `reservation-lifecycle-service.ts` | mutable fields, side-effect idempotency |
| `GET /v1/resource-maintenance` | `routes/resource-maintenance.ts` | `schemas/resource-maintenance.ts` | `resource-maintenance-service.ts` | filters by service/resource/date/status |
| `POST /v1/resource-maintenance` | `routes/resource-maintenance.ts` | `schemas/resource-maintenance.ts` | `resource-maintenance-service.ts` | validation, idempotency |
| `POST /v1/resource-maintenance/{maintenance_id}/end` | `routes/resource-maintenance.ts` | `schemas/resource-maintenance.ts` | `resource-maintenance-service.ts` | lifecycle rules, idempotency |

## Optional Module Endpoints

Optional endpoint paths should register lightweight guard routes even when the
module is disabled. Enabled modules route to their implementation; disabled
modules return the shared error shape with module-specific codes such as
`chat_module_disabled` or `payment_module_disabled`. This keeps direct HTTP and
SDK consumers on the same predictable error contract instead of falling through
to a generic 404.

| Endpoint | Module | Route file | SDK namespace | Idempotency |
| --- | --- | --- | --- | --- |
| `POST /v1/chat/reservation-sessions` | AI chat | `modules/chat/routes.ts` | `chat.createReservationSession` | required when a session create stores backend state |
| `POST /v1/chat/reservation-sessions/{chat_session_id}/messages` | AI chat | `modules/chat/routes.ts` | `chat.sendMessage` | required when the message can store state or trigger tools |
| `POST /v1/chat/reservation-sessions/{chat_session_id}/confirm` | AI chat | `modules/chat/routes.ts` | `chat.confirmReservation` | required; creates or mutates reservation state |
| `POST /v1/payment-references` | Payments | `modules/payments/routes.ts` | `payments.createPaymentReference` | required when provider side effects are created |
| `GET /v1/payment-references/{payment_reference_id}` | Payments | `modules/payments/routes.ts` | `payments.getPaymentReference` | not required |

Phase 6 owns detailed AI chat extraction. Phase 4 only reserves the API/SDK
surface, schemas, error shape, idempotency behavior, and module mounting
pattern.

Other Phase 1 optional modules, such as structured knowledge retrieval,
notification workflows, analytics/report APIs, and content/CMS APIs, remain
deferred unless a later phase explicitly scopes them. Do not implement those
routes as part of Phase 4 by default.

## Contract Type And Schema Plan

Use `packages/contract-types` as the canonical TypeScript and runtime schema
source for API, SDK, OpenAPI generation, and example validation.

Current branch implementation note: the in-repository compatibility track now
generates local public contract artifacts from
`packages/contract-types/src/contract-artifact-registry.ts` into
`packages/contract-types/contracts/openapi.json` and
`packages/contract-types/contracts/json-schema/*.schema.json`. The generation
is deterministic, dependency-free, and checked by
`corepack pnpm --filter @reservation-platform/contract-types run contracts:check`.
This satisfies local artifact generation/checking for the existing public `/v1`
contracts, while the final standalone backend repository extraction and live
seeded backend parity remain future work.

Recommended approach:

- Define request and response schemas in `packages/contract-types/src/schemas`.
- Export inferred TypeScript types from `packages/contract-types/src/types`.
- Re-export public contracts from `packages/contract-types/src/index.ts`.
- Maintain the existing `packages/contract-types/contracts/openapi.json`
  artifact from route metadata plus schemas.
- Maintain the existing JSON Schema artifacts under
  `packages/contract-types/contracts/json-schema`.
- Validate `packages/contract-types/contracts/examples/**/*.json` in tests
  against the schemas.

Schema groups:

- Common primitives: `TenantId`, `VenueId`, `ServiceId`, `ResourceId`,
  `ReservationId`, `DateTime`, `Pagination`, `Metadata`, `Money`, `ModuleName`.
- Catalog: `Tenant`, `Venue`, `Service`, `Resource`, `ResourceLayout`.
- Availability: `AvailabilityQuery`, `AvailabilitySlot`,
  `AvailabilityResponse`, resource availability summaries.
- Reservations: `CustomerSnapshot`, `ReservationItem`, `Reservation`,
  `CreateReservationRequest`, `CreateReservationResponse`,
  `ListReservationsQuery`, `UpdateReservationRequest`.
- Lifecycle: `CancelReservationRequest`, `RescheduleReservationRequest`,
  lifecycle response envelopes.
- Maintenance: `ResourceMaintenanceBlock`, `CreateResourceMaintenanceRequest`,
  `EndResourceMaintenanceRequest`.
- Errors: `PlatformErrorResponse`, `PlatformError`, `PlatformErrorCause`.
- Idempotency: `IdempotencyMetadata`, `IdempotencyStatus`.
- Optional chat: chat session, message, prepared booking, confirmation request
  and response.
- Optional payment: payment reference request and response.

## API Implementation Slices

### Slice 4.1: API Scaffold And Cross-Cutting Middleware

Scope:

- Create `apps/api` app entrypoints, router registration, health wiring, and
  `/v1` route prefix.
- Add middleware for auth context, tenant context, correlation IDs,
  idempotency, validation, and error serialization.
- Keep using the existing local generation/check wiring provided by
  `contracts:check`; remaining work is publication, live release, and final
  standalone extraction of the package-owned artifacts.

Acceptance:

- API can return `GET /v1/metadata`.
- Every response includes or can trace a `request_id`.
- Errors serialize with the Phase 1 shape.
- Route handlers do not import current Next.js route files.

### Slice 4.2: Contract Types And OpenAPI Artifacts

Scope:

- Implement all core schemas and exported types in `packages/contract-types`.
- Maintain and verify the existing package-owned OpenAPI artifact at
  `packages/contract-types/contracts/openapi.json` and JSON Schema artifacts
  under `packages/contract-types/contracts/json-schema`.
- Publish or extract those package-owned artifacts during release or standalone
  backend extraction work.
- Maintain example request/response files listed in this document.

Acceptance:

- OpenAPI lists every core endpoint and module-gated chat/payment endpoints.
- Examples validate against schemas.
- SDK and API import types/schemas from `packages/contract-types`.
- No schema uses current app-specific route names such as `/api/bookings` or
  seat-only canonical fields.

### Slice 4.3: Catalog And Metadata Routes

Scope:

- Implement metadata, tenants, venues, services, resources, and resource-layout
  routes.
- Add application service methods for catalog reads.
- Enforce tenant/venue visibility and disabled resource behavior.

Acceptance:

- A frontend can load tenant, venue, service, resource, and layout data without
  database access.
- Results use generic `resource`, `layout`, `service`, and `venue` fields.
- Legacy display labels may appear as metadata, not canonical route names.

### Slice 4.4: Availability Route

Scope:

- Implement `GET /v1/availability`.
- Parse query input, load service/resources/reservations/maintenance through
  storage ports, call domain availability validation/evaluation, and serialize
  generic slots.

Acceptance:

- Availability works for capacity-only, assigned-resource, hybrid, room,
  appointment, event, movie-seat, and simulator-resource examples.
- Cancelled reservations do not reduce availability.
- Maintenance and existing reservations reduce availability.
- Domain does not execute database calls; application/storage layers do.

### Slice 4.5: Reservation Creation Route

Scope:

- Implement `POST /v1/reservations`.
- Require `Idempotency-Key`.
- Load current state, call domain create validation/build-command, and execute
  atomic persistence through the storage adapter/application service.
- Return canonical `ReservationResult` plus idempotency metadata when present.

Acceptance:

- Create is atomic: all allocations persist or none persist.
- Conflict checks are re-run at booking time.
- Missing or reused idempotency keys return Phase 1 idempotency errors.
- API, SDK, and direct HTTP produce equivalent booking outcomes.

### Slice 4.6: Reservation Read, List, And Lifecycle Routes

Scope:

- Implement `GET /v1/reservations/{reservation_id}`,
  `GET /v1/reservations`, cancel, reschedule, and patch.
- Add lifecycle application service methods.
- Route side-effecting operations through idempotency middleware.

Acceptance:

- Reads enforce caller visibility.
- Cancel, reschedule, and side-effecting patch all require idempotency.
- Reschedule and quantity/resource-changing patch re-check availability,
  conflicts, maintenance, and lifecycle rules.
- Metadata-only patch behavior is explicitly marked safe or idempotency
  supported in OpenAPI.

### Slice 4.7: Resource Maintenance Routes

Scope:

- Implement list, create, and end resource maintenance routes.
- Use domain maintenance validation to build commands.
- Execute persistence through storage adapter/application service.

Acceptance:

- Create and end require idempotency.
- Generic resources are supported without Racing Simulator defaults.
- Maintenance blocks affect availability responses.
- Ending an inactive/nonexistent block returns a stable lifecycle/catalog error.

### Slice 4.8: Optional Chat And Payment Route Stubs

Scope:

- Add module-gated route mounting for chat and payment surfaces.
- When enabled, validate payloads and delegate to optional module application
  services.
- When disabled, return shared error shape with module-disabled codes.

Acceptance:

- Core API can run without chat or payment packages enabled.
- OpenAPI marks optional routes as module-gated.
- Chat confirmation and payment side-effect endpoints require idempotency.
- Chat and payment modules call core API/application/domain contracts rather
  than duplicating booking rules.

## SDK Implementation Plan

Target package:

```text
reservation-platform-backend/packages/sdk
```

Public construction:

```ts
const client = createReservationPlatformClient({
  baseUrl: "https://api.example.com",
  tenantId: "tenant_123",
  venueId: "venue_123",
  getAccessToken: async () => "...",
});
```

Core SDK methods must mirror Phase 1:

| SDK method | HTTP mapping | Module file |
| --- | --- | --- |
| `getMetadata()` | `GET /v1/metadata` | `modules/metadata.ts` |
| `getCurrentTenant()` | `GET /v1/tenants/current` | `modules/tenants.ts` |
| `listVenues(input?)` | `GET /v1/venues` | `modules/venues.ts` |
| `getVenue(venueId)` | `GET /v1/venues/{venue_id}` | `modules/venues.ts` |
| `listServices(input?)` | `GET /v1/services` | `modules/services.ts` |
| `getService(serviceId)` | `GET /v1/services/{service_id}` | `modules/services.ts` |
| `listResources(input?)` | `GET /v1/resources` | `modules/resources.ts` |
| `getResource(resourceId)` | `GET /v1/resources/{resource_id}` | `modules/resources.ts` |
| `getResourceLayout(layoutId)` | `GET /v1/resource-layouts/{layout_id}` | `modules/resource-layouts.ts` |
| `listAvailability(input)` | `GET /v1/availability` | `modules/availability.ts` |
| `createReservation(input, options?)` | `POST /v1/reservations` | `modules/reservations.ts` |
| `getReservation(reservationId)` | `GET /v1/reservations/{reservation_id}` | `modules/reservations.ts` |
| `listReservations(input?)` | `GET /v1/reservations` | `modules/reservations.ts` |
| `cancelReservation(reservationId, input?, options?)` | `POST /v1/reservations/{reservation_id}/cancel` | `modules/reservations.ts` |
| `rescheduleReservation(reservationId, input, options?)` | `POST /v1/reservations/{reservation_id}/reschedule` | `modules/reservations.ts` |
| `updateReservation(reservationId, patch, options?)` | `PATCH /v1/reservations/{reservation_id}` | `modules/reservations.ts` |
| `listResourceMaintenance(input?)` | `GET /v1/resource-maintenance` | `modules/resource-maintenance.ts` |
| `createResourceMaintenance(input, options?)` | `POST /v1/resource-maintenance` | `modules/resource-maintenance.ts` |
| `endResourceMaintenance(maintenanceId, input?, options?)` | `POST /v1/resource-maintenance/{maintenance_id}/end` | `modules/resource-maintenance.ts` |

Optional SDK namespaces:

- `client.chat.createReservationSession(input, options?)`
- `client.chat.sendMessage(chatSessionId, input, options?)`
- `client.chat.confirmReservation(chatSessionId, input, options)`
- `client.payments.createPaymentReference(input, options)`
- `client.payments.getPaymentReference(paymentReferenceId)`

SDK requirements:

- Use `packages/contract-types` for all public inputs, outputs, and errors.
- Attach `Authorization`, tenant, venue, correlation, and idempotency headers
  consistently.
- Throw or return a `PlatformError` that preserves the API error object exactly.
- Provide `isPlatformError(error)` and `isRetryable(error)` helpers.
- Require explicit `idempotencyKey` options for required mutation methods unless
  the caller opts into a documented `generateIdempotencyKey` helper.
- Never silently reuse an idempotency key across distinct user intents.
- Do not compute availability, select substitute resources, approve lifecycle
  transitions, or modify booking payloads according to SDK-only rules.

## Idempotency Coverage

Implement idempotency middleware and SDK options for every required mutation
intent from `contracts/idempotency-conventions.md`.

| Intent | Endpoint or method | Required behavior |
| --- | --- | --- |
| Create reservation | `POST /v1/reservations`, `createReservation` | Require `Idempotency-Key`; replay identical success; reject changed payload |
| Cancel reservation | `POST /v1/reservations/{reservation_id}/cancel`, `cancelReservation` | Require key per cancel intent; replay result |
| Reschedule reservation | `POST /v1/reservations/{reservation_id}/reschedule`, `rescheduleReservation` | Require key; request hash includes new slot/resources |
| Side-effecting reservation patch | `PATCH /v1/reservations/{reservation_id}`, `updateReservation` | Require key for status, quantity, slot, resource, payment, or side-effecting fields |
| Create resource maintenance | `POST /v1/resource-maintenance`, `createResourceMaintenance` | Require key; request hash includes resources/date range |
| End resource maintenance | `POST /v1/resource-maintenance/{maintenance_id}/end`, `endResourceMaintenance` | Require key; replay ended-state response |
| Stateful chat session creation | `POST /v1/chat/reservation-sessions`, `chat.createReservationSession` | Require key when session creation persists backend state |
| Chat confirmation | `POST /v1/chat/reservation-sessions/{chat_session_id}/confirm`, `chat.confirmReservation` | Require key; creates/modifies reservation through core contracts |
| Chat message with side effects | `POST /v1/chat/reservation-sessions/{chat_session_id}/messages`, `chat.sendMessage` | Require key when message persists state or triggers tools |
| Payment side effects | `POST /v1/payment-references`, `payments.createPaymentReference` | Require key when provider or reservation state can change |

Idempotency storage should hash the normalized route, tenant context, caller
context, request body, and key. Replays should include `idempotency` response
metadata when useful:

```json
{
  "idempotency": {
    "key": "4fd3f5db-54bf-4e2e-881b-67d0f7a0dc4e",
    "status": "replayed",
    "original_request_id": "req_123"
  }
}
```

## Request And Response Examples

Target example files should live under the current package-owned artifact path,
`packages/contract-types/contracts/examples`; that directory should move with
`packages/contract-types` during future standalone backend extraction.

### `availability-request.json`

```json
{
  "venue_id": "venue_123",
  "service_id": "svc_123",
  "start_at": "2026-06-08T12:00:00+08:00",
  "end_at": "2026-06-08T18:00:00+08:00",
  "quantity": 2,
  "resource_ids": ["res_a1", "res_a2"]
}
```

### `availability-response.json`

```json
{
  "slots": [
    {
      "start_at": "2026-06-08T12:00:00+08:00",
      "end_at": "2026-06-08T13:00:00+08:00",
      "available_quantity": 4,
      "is_available": true,
      "resource_ids": ["res_a1", "res_a2"],
      "taken_resource_labels": ["A3"],
      "maintenance_resource_labels": []
    }
  ],
  "total_quantity": 6,
  "resource_kind": "seat",
  "resource_strategy": "assigned_resource",
  "resources": [
    {
      "resource_id": "res_a1",
      "label": "A1",
      "kind": "seat",
      "is_active": true,
      "capacity": 1
    }
  ],
  "layout": {
    "layout_id": "layout_123",
    "kind": "grid",
    "metadata": {
      "columns": 3,
      "rows": 2
    }
  }
}
```

### `create-reservation-request.json`

```json
{
  "venue_id": "venue_123",
  "service_id": "svc_123",
  "start_at": "2026-06-08T12:00:00+08:00",
  "end_at": "2026-06-08T13:00:00+08:00",
  "quantity": 2,
  "reservation_items": [
    {
      "resource_id": "res_a1",
      "quantity": 1
    },
    {
      "resource_id": "res_a2",
      "quantity": 1
    }
  ],
  "customer": {
    "name": "Avery Tan",
    "email": "avery@example.com",
    "phone": "+60123456789"
  },
  "source": "web",
  "metadata": {
    "external_cart_id": "cart_123"
  }
}
```

Required HTTP headers:

```http
Authorization: Bearer <token>
Idempotency-Key: 4fd3f5db-54bf-4e2e-881b-67d0f7a0dc4e
X-Correlation-Id: corr_123
```

### `create-reservation-response.json`

```json
{
  "reservation_id": "resv_123",
  "status": "confirmed",
  "tenant_id": "tenant_123",
  "venue_id": "venue_123",
  "service_id": "svc_123",
  "start_at": "2026-06-08T12:00:00+08:00",
  "end_at": "2026-06-08T13:00:00+08:00",
  "quantity": 2,
  "reservation_items": [
    {
      "resource_id": "res_a1",
      "quantity": 1
    }
  ],
  "customer": {
    "name": "Avery Tan",
    "email": "avery@example.com",
    "phone": "+60123456789"
  },
  "created_at": "2026-06-08T04:00:01Z",
  "updated_at": "2026-06-08T04:00:01Z"
}
```

### Lifecycle And Maintenance Target Examples

Create these files even if initial payloads are minimal:

- `cancel-reservation-request.json`
- `reschedule-reservation-request.json`
- `update-reservation-request.json`
- `resource-maintenance-create-request.json`
- `resource-maintenance-end-request.json`
- `chat-session-create-request.json`
- `chat-message-request.json`
- `chat-confirm-request.json`
- `payment-reference-create-request.json`
- `payment-reference-create-response.json`
- `payment-reference-read-response.json`

## Error Shape Reference

All API and SDK errors use the Phase 1 error response shape from
`contracts/error-conventions.md`:

```json
{
  "error": {
    "code": "resource_conflict",
    "message": "The requested resource is not available for the selected slot.",
    "status": 409,
    "request_id": "req_123",
    "details": {
      "service_id": "svc_123",
      "resource_ids": ["res_a1"],
      "start_at": "2026-06-08T12:00:00+08:00",
      "end_at": "2026-06-08T13:00:00+08:00"
    },
    "causes": [
      {
        "code": "resource_already_reserved",
        "field": "reservation_items.0.resource_id",
        "resource_id": "res_a1"
      }
    ],
    "retryable": false
  }
}
```

API middleware should map domain and storage errors into this shape. SDK error
helpers must preserve the `error` object exactly so direct HTTP consumers and
SDK consumers can rely on the same machine-readable contract.

## Test Strategy

API tests under `apps/api/src/tests`:

- `api-contract.test.ts`: every Phase 1 endpoint exists in route registration
  and OpenAPI.
- `error-shape.test.ts`: validation, auth, catalog, conflict, idempotency,
  module-disabled, and storage errors serialize correctly.
- `idempotency.test.ts`: missing keys, replayed requests, changed payloads, and
  expired replay metadata.
- `availability.routes.test.ts`: catalog loading, domain invocation, generic
  response shape, maintenance/reservation effects.
- `reservations.routes.test.ts`: create/read/list, atomic command invocation,
  tenant scoping, conflict responses.
- `reservation-lifecycle.routes.test.ts`: cancel, reschedule, side-effecting
  patch, metadata-only patch policy.
- `resource-maintenance.routes.test.ts`: list/create/end and availability
  integration.
- `chat.routes.test.ts`: disabled module response, enabled route validation,
  stateful session creation idempotency, message side-effect idempotency, and
  confirmation idempotency.
- `payments.routes.test.ts`: disabled module response, create/read validation,
  payment side-effect idempotency, and provider error mapping.

SDK tests under `packages/sdk/src/tests`:

- `client.test.ts`: base URL, headers, auth token, tenant/venue/correlation
  context.
- `methods.test.ts`: every SDK method maps to the expected HTTP method/path.
- `errors.test.ts`: API error shape is preserved and helpers identify
  retryable/platform errors.
- `idempotency.test.ts`: required mutation methods enforce or pass
  idempotency keys correctly.
- `direct-http-parity.test.ts`: SDK requests and direct HTTP examples produce
  equivalent payloads and errors.

Contract tests:

- OpenAPI validates.
- Existing JSON Schema artifacts are present and pass `contracts:check`.
- Example request/response files validate against schemas.
- Optional routes are present but marked module-gated.

## Deliverables

- API implementation plan: this Phase 4 file.
- SDK implementation plan: this Phase 4 file.
- Request/response examples: target files and inline examples in this Phase 4
  file.
- Error shape reference: this Phase 4 file and
  `contracts/error-conventions.md`.

Future implementation subagents should create the target files in
`reservation-platform-backend` and keep this planning document updated if route,
schema, SDK, or idempotency decisions change.

## Acceptance Criteria

- A frontend can integrate through `/v1` HTTP without direct database access.
- SDK is optional for consumers; direct HTTP remains the source of truth.
- API avoids current app-specific route assumptions such as `/api/bookings`,
  `/api/availability`, seat-only route names, Next.js route handlers, or
  frontend page structure.
- All Phase 1 core endpoints are implemented and documented.
- Optional chat endpoints are included as optional/module-gated.
- API routes call application services/storage adapters for persistence and
  domain services only for validation/command building.
- Domain code does not talk to the database.
- SDK mirrors direct HTTP and contains no divergent booking, availability,
  lifecycle, or maintenance rules.
- Idempotency covers reservation create, cancel, reschedule, side-effecting
  patch, resource-maintenance create/end, chat confirmation, chat messages with
  side effects, and payment side effects.
- OpenAPI, JSON Schema, contract examples, API tests, SDK tests, and parity
  tests exist for the implemented surface.

## Downstream Updates Required

No downstream phase updates are required from this planning pass because Phase
4 preserves the Phase 1 `/v1` route list, SDK method list, error conventions,
idempotency conventions, Phase 2 repo shape, and Phase 3 domain boundary.

If future implementation changes endpoints, SDK method names, request/response
shapes, optional module assumptions, or idempotency requirements, update:

- `contracts/api-resource-list.md`
- `contracts/sdk-method-list.md`
- `contracts/error-conventions.md`
- `contracts/idempotency-conventions.md`
- Phases 6 through 9 and external frontend examples
