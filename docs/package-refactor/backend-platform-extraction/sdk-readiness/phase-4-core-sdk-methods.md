# Phase 4: Core SDK Methods

## Purpose

Implement the core methods external apps will use from
`@reservation-platform/sdk`.

Each method is a typed wrapper over one backend `/v1` endpoint. The SDK may
construct URLs, serialize query params, attach auth/tenant/venue/correlation
and idempotency headers, parse JSON, and throw `PlatformError`. It must not
change booking behavior, hide backend errors, retry mutations with new
idempotency keys, or reimplement backend rules.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/sdk-readiness/README.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-0-sdk-boundary-reset.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-1-backend-api-prerequisite.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-2-contract-types-package.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-3-sdk-package-scaffold.md`
- `docs/package-refactor/backend-platform-extraction/contracts/api-resource-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/sdk-method-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/error-conventions.md`
- `docs/package-refactor/backend-platform-extraction/contracts/idempotency-conventions.md`

## Write Scope

Implementation work belongs in:

- `reservation-platform-backend/packages/sdk/src/**`
- `reservation-platform-backend/packages/sdk/tests/**`
- SDK package-local fixtures needed for method parity tests

For this planning pass, edit only this phase doc if Phase 4 assumptions change.
Do not edit backend endpoint implementations, contract schema source, current
frontend UI, backend domain packages, storage adapters, or other phase docs
unless explicitly assigned.

## Non-Goals

- Do not add backend reservation, availability, capacity, lifecycle, policy, or
  maintenance rules to the SDK.
- Do not make SDK methods call Supabase, database RPCs, storage adapters,
  backend domain packages, current app route handlers, or current UI code.
- Do not add optional chat, payments, reports, content, or notification methods
  to the core client in this phase.
- Do not silently generate idempotency keys for caller mutations.
- Do not translate backend error codes into frontend copy or UI states.
- Do not add framework-specific behavior for Next.js, React, cookies, server
  actions, or browser storage.

## SDK Methods

Implement the core methods from `contracts/sdk-method-list.md`:

| SDK method | HTTP mapping | Request contract | Response contract | Idempotency |
| --- | --- | --- | --- | --- |
| `getMetadata()` | `GET /v1/metadata` | none | `MetadataResponse` | None |
| `getCurrentTenant()` | `GET /v1/tenants/current` | none | `TenantResponse` | None |
| `listVenues(input?)` | `GET /v1/venues` | `ListVenuesQuery` | `ListVenuesResponse` | None |
| `getVenue(venueId)` | `GET /v1/venues/{venue_id}` | path param | `VenueResponse` | None |
| `listServices(input?)` | `GET /v1/services` | `ListServicesQuery` | `ListServicesResponse` | None |
| `getService(serviceId)` | `GET /v1/services/{service_id}` | path param | `ServiceResponse` | None |
| `listResources(input?)` | `GET /v1/resources` | `ListResourcesQuery` | `ListResourcesResponse` | None |
| `getResource(resourceId)` | `GET /v1/resources/{resource_id}` | path param | `ResourceResponse` | None |
| `getResourceLayout(layoutId)` | `GET /v1/resource-layouts/{layout_id}` | path param | `ResourceLayoutResponse` | None |
| `listAvailability(input)` | `GET /v1/availability` | `AvailabilityQuery` | `AvailabilityResponse` | None |
| `createReservation(input, options?)` | `POST /v1/reservations` | `CreateReservationInput` | `ReservationResponse` | Required |
| `getReservation(reservationId)` | `GET /v1/reservations/{reservation_id}` | path param | `ReservationResponse` | None |
| `listReservations(input?)` | `GET /v1/reservations` | `ListReservationsQuery` | `ListReservationsResponse` | None |
| `updateReservation(reservationId, patch, options?)` | `PATCH /v1/reservations/{reservation_id}` | `UpdateReservationPatch` | `ReservationResponse` | Required for side-effecting non-slot patches; API decides when optional |
| `cancelReservation(reservationId, input?, options?)` | `POST /v1/reservations/{reservation_id}/cancel` | `CancelReservationInput` | `ReservationResponse` | Required |
| `rescheduleReservation(reservationId, input, options?)` | `POST /v1/reservations/{reservation_id}/reschedule` | `RescheduleReservationInput` | `ReservationResponse` | Required |
| `listResourceMaintenance(input?)` | `GET /v1/resource-maintenance` | `ListResourceMaintenanceQuery` | `ListResourceMaintenanceResponse` | None |
| `createResourceMaintenance(input, options?)` | `POST /v1/resource-maintenance` | `CreateResourceMaintenanceInput` | `ResourceMaintenanceResponse` | Required |
| `endResourceMaintenance(maintenanceId, input?, options?)` | `POST /v1/resource-maintenance/{maintenance_id}/end` | `EndResourceMaintenanceInput` | `ResourceMaintenanceResponse` | Required |

## Request Options

Constructor options come from Phase 3:

```ts
type ReservationPlatformClientOptions = {
  baseUrl: string;
  tenantId?: string;
  venueId?: string;
  apiVersion?: "v1" | string;
  getAccessToken?: () => Promise<string | undefined> | string | undefined;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  fetch?: typeof fetch;
  onRequest?: (request: SDKRequestInfo) => void | Promise<void>;
  onResponse?: (response: SDKResponseInfo) => void | Promise<void>;
};
```

Per-request options:

```ts
type RequestOptions = {
  idempotencyKey?: string;
  correlationId?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
};
```

Header behavior:

- Auth token from `getAccessToken` becomes the configured bearer auth header.
- `tenantId` and `venueId` become the backend-agreed tenant/venue context
  headers only when configured or supplied by the caller.
- `correlationId` becomes the backend-agreed correlation header.
- `idempotencyKey` becomes `Idempotency-Key`.
- Caller headers may add safe custom headers but must not remove required auth,
  tenant, venue, or idempotency headers after the SDK has resolved them unless
  an explicit override rule is documented.

## Error Behavior

- Non-2xx API responses with the shared error shape throw `PlatformError`.
- `PlatformError` must preserve the exact API error object, including `code`,
  `message`, `status`, `request_id`, `details`, `causes`, `retryable`, optional
  `idempotency`, and optional `documentation_url`.
- `isPlatformError(error)` and `isRetryable(error)` may inspect the preserved
  error object but must not rewrite it.
- The SDK must not parse `message` for behavior.
- The SDK must not map errors to frontend copy.
- Invalid or non-JSON error responses may be wrapped with a transport-level
  `PlatformError`, but tests must distinguish that from normal API error
  parity.

## Idempotency Behavior

- Required-idempotency methods accept `RequestOptions` with `idempotencyKey`.
- The SDK default is to preserve backend behavior: if the caller omits a
  required idempotency key, the SDK sends the request and lets the API return
  `missing_idempotency_key`, unless a later phase explicitly documents
  client-side preflight validation.
- The SDK may expose helper functions for generating keys only when the caller
  opts in and controls user intent boundaries.
- The SDK must never silently reuse a key across distinct method calls or user
  intents.
- Retries, if added later, must reuse the same caller-provided key for the same
  request intent and must never create a new mutation intent invisibly.
- Idempotency replay metadata from the API must be preserved in success
  responses or errors according to the contract.

## Direct HTTP Parity Rule

For the same base URL, path, query, JSON body, headers, auth context,
tenant/venue context, correlation ID, idempotency key, and abort behavior:

- SDK success payload equals direct HTTP success payload.
- SDK non-2xx error object equals direct HTTP error object.
- SDK status handling follows the API status.
- SDK query serialization matches direct HTTP examples.
- SDK does not add validation that causes a different outcome unless that
  validation is explicitly documented and covered by parity exceptions.

Direct HTTP parity tests are mandatory proof that the SDK is a client wrapper,
not a second backend.

## Implementation Steps

1. Import DTO types from `@reservation-platform/contract-types`; do not define
   duplicate SDK-only DTOs.
2. Implement a shared request helper for base URL joining, `/v1` versioning,
   query serialization, JSON body serialization, header resolution, fetch
   invocation, and JSON parsing.
3. Implement read methods for metadata, tenant, venues, services, resources,
   resource layouts, availability, reservations, and resource maintenance.
4. Implement mutation methods for create, update, cancel, reschedule, create
   maintenance, and end maintenance through the same request helper.
5. Implement error parsing and `PlatformError` preservation.
6. Implement idempotency header plumbing without silent key generation.
7. Add method-to-endpoint tests asserting HTTP method, path, query, body, and
   headers for each core method.
8. Add direct HTTP parity tests comparing SDK calls against raw fetch calls for
   representative success, validation error, conflict error, missing
   idempotency, replay, and key-reuse cases.
9. Add forbidden import tests from Phase 3 if they are not already running in
   the SDK test suite.
10. Add consumer-style examples showing SDK usage while noting that direct HTTP
    remains equivalent.

## Deliverables

- Core SDK method implementation plan.
- Method-to-endpoint test matrix covering all core methods.
- Request option and header behavior tests.
- `PlatformError` preservation tests.
- Idempotency behavior tests for required mutations.
- Direct HTTP parity test plan and representative fixtures.

## Acceptance Criteria

- Every core method in `contracts/sdk-method-list.md` is implemented, including
  `rescheduleReservation`.
- Every method maps to exactly one Phase 1 `/v1` endpoint.
- SDK behavior equals direct HTTP behavior for success payloads, errors,
  idempotency, and status handling.
- `PlatformError` preserves all machine-readable API error fields.
- Required-idempotency methods pass `Idempotency-Key` when supplied and preserve
  the API's `missing_idempotency_key` behavior when omitted.
- SDK code imports public DTOs from `@reservation-platform/contract-types` and
  does not import domain, adapter, Supabase, React, Next.js, database, or
  current app internals.
- Tests prove request construction, error preservation, idempotency behavior,
  and direct HTTP parity.

## Downstream Update Notes

- Phase 5 must build auth, tenant, venue, correlation, and idempotency
  refinements on these request options instead of changing method semantics.
- Phase 6 optional chat methods must follow the same method-to-endpoint,
  error, idempotency, and direct HTTP parity rules.
- Phase 7 external consumer smoke tests must call representative methods from a
  non-Next.js app and compare SDK behavior with direct HTTP.
- Phase 8 release docs must publish method names, request options, error
  behavior, and idempotency behavior exactly as implemented here.
- If any core method name, endpoint, DTO, request option, error behavior,
  idempotency default, or package import rule changes, update Phase 1, Phase 2,
  Phase 3, `contracts/api-resource-list.md`, and
  `contracts/sdk-method-list.md` before implementation continues.
