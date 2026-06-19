# Phase 1: Backend API Prerequisite

## Purpose

Define and prove the backend `/v1` API that `@reservation-platform/sdk` will
call.

The SDK cannot be a drop-into-any-frontend package until direct HTTP consumers
can use the same backend contract without importing this app, Supabase clients,
domain packages, route handlers, or UI. Phase 1 treats direct HTTP as the source
of truth. The SDK must later match direct HTTP behavior exactly.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/sdk-readiness/README.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-0-sdk-boundary-reset.md`
- `docs/package-refactor/backend-platform-extraction/contracts/api-resource-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/sdk-method-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/error-conventions.md`
- `docs/package-refactor/backend-platform-extraction/contracts/idempotency-conventions.md`
- Backend extraction repo-shape/API plans if implementation is happening in
  `reservation-platform-backend`.

## Write Scope

Implementation work belongs in the backend platform repository, defaulting to:

- `reservation-platform-backend/apps/api`
- `reservation-platform-backend/packages/contract-types`
- backend API tests and OpenAPI/JSON Schema publication outputs owned by the API
  or generated from the contract package artifacts

For this planning pass, edit only this phase doc if Phase 1 assumptions change.
Do not edit SDK source, current frontend UI, current `app/api/**` routes, or
other phase docs unless explicitly assigned.

## Non-Goals

- Do not implement SDK methods in Phase 1.
- Do not make `@reservation-platform/sdk` call Supabase or storage adapters.
- Do not copy current Next.js host-app API routes verbatim into the platform
  without extracting a stable `/v1` contract.
- Do not add frontend-only payload fields, React state, labels, or display
  assumptions to API contracts.
- Do not add standalone customer CRUD endpoints unless a later phase scopes
  customer lifecycle explicitly.
- Do not make optional chat, payments, reports, content, or notification
  modules blockers for the core reservation SDK.

## Endpoint-To-SDK Mapping

Every core SDK method must have a matching `/v1` endpoint. The SDK may wrap
headers, query serialization, JSON parsing, and error throwing, but direct HTTP
and SDK calls must return the same success payloads and error payloads for the
same request context.

| API endpoint | SDK method | Required in core SDK | Idempotency |
| --- | --- | --- | --- |
| `GET /v1/metadata` | `getMetadata()` | Yes | None |
| `GET /v1/tenants/current` | `getCurrentTenant()` | Yes | None |
| `GET /v1/venues` | `listVenues(input?)` | Yes | None |
| `GET /v1/venues/{venue_id}` | `getVenue(venueId)` | Yes | None |
| `GET /v1/services` | `listServices(input?)` | Yes | None |
| `GET /v1/services/{service_id}` | `getService(serviceId)` | Yes | None |
| `GET /v1/resources` | `listResources(input?)` | Yes | None |
| `GET /v1/resources/{resource_id}` | `getResource(resourceId)` | Yes | None |
| `GET /v1/resource-layouts/{layout_id}` | `getResourceLayout(layoutId)` | Yes | None |
| `GET /v1/availability` | `listAvailability(input)` | Yes | None |
| `POST /v1/reservations` | `createReservation(input, options?)` | Yes | Required |
| `GET /v1/reservations` | `listReservations(input?)` | Yes | None |
| `GET /v1/reservations/{reservation_id}` | `getReservation(reservationId)` | Yes | None |
| `PATCH /v1/reservations/{reservation_id}` | `updateReservation(reservationId, patch, options?)` | Yes | Required for side-effecting non-slot patches; optional only when the endpoint marks a metadata-only patch safe |
| `POST /v1/reservations/{reservation_id}/cancel` | `cancelReservation(reservationId, input?, options?)` | Yes | Required |
| `POST /v1/reservations/{reservation_id}/reschedule` | `rescheduleReservation(reservationId, input, options?)` | Yes | Required |
| `GET /v1/resource-maintenance` | `listResourceMaintenance(input?)` | Yes | None |
| `POST /v1/resource-maintenance` | `createResourceMaintenance(input, options?)` | Yes | Required |
| `POST /v1/resource-maintenance/{maintenance_id}/end` | `endResourceMaintenance(maintenanceId, input?, options?)` | Yes | Required |

Optional module endpoints from `contracts/api-resource-list.md` may be planned
after the core API is stable. They must use separate SDK namespaces or
feature-gated exports if implemented.

## Direct HTTP Parity Requirements

- Direct HTTP is the canonical contract for path names, methods, headers,
  request DTOs, response DTOs, status codes, and errors.
- SDK calls must send the same tenant, venue, auth, correlation, and
  idempotency context that a direct HTTP caller would send.
- The API must return the shared `PlatformError` response shape from
  `contracts/error-conventions.md`.
- The API must reject required-idempotency mutations without `Idempotency-Key`
  using `missing_idempotency_key`.
- The API must not require frontends to send database table names, RPC names,
  storage adapter names, or domain package identifiers.
- OpenAPI/JSON Schema artifacts must describe the direct HTTP contract first.
  The current repository generates package-owned artifacts from
  `@reservation-platform/contract-types` and checks them with `contracts:check`;
  backend publication/final standalone extraction can consume those artifacts in
  later release work.

## Implementation Steps

1. Confirm the backend platform location, defaulting to
   `reservation-platform-backend/apps/api`.
2. Create a `/v1` route inventory from the endpoint-to-SDK mapping table and
   mark any missing endpoint as a Phase 1 blocker.
3. Define request context handling for tenant, venue, caller auth,
   correlation ID, and idempotency headers.
4. Wire route validation to `@reservation-platform/contract-types` schemas once
   Phase 2 exists, or define temporary contract stubs that Phase 2 must replace.
5. Route each endpoint to backend application services that own reservation,
   availability, lifecycle, and maintenance rules.
6. Serialize success responses with public DTO names only.
7. Serialize errors with the shared `PlatformError` shape and stable snake_case
   codes.
8. Enforce idempotency for protected mutations listed in the mapping table and
   `contracts/idempotency-conventions.md`.
9. Publish OpenAPI/JSON Schema artifacts from the route contracts or consume the
   checked artifacts generated by `@reservation-platform/contract-types`.
10. Add direct HTTP smoke tests covering reads, successful mutations,
    validation errors, conflict errors, auth/tenant failures, and idempotency
    replay/reuse behavior.

## Deliverables

- Backend `/v1` endpoint inventory with each core endpoint implemented or
  explicitly blocked.
- Endpoint-to-SDK mapping table kept in sync with
  `contracts/sdk-method-list.md`.
- Direct HTTP smoke test plan and initial tests for core resources.
- Error and idempotency behavior checklist.
- OpenAPI/JSON Schema publication plan using the checked generated artifacts
  from `@reservation-platform/contract-types`.

## Acceptance Criteria

- A consumer frontend can call every core `/v1` endpoint directly over HTTP
  without importing SDK, Supabase, Next.js, React, backend domain packages, or
  storage adapters.
- Every core SDK method in `contracts/sdk-method-list.md` has exactly one
  matching API endpoint in this phase.
- Direct HTTP responses use the same DTO names and shapes that Phase 2 will
  publish from `@reservation-platform/contract-types`.
- Required idempotency mutations reject missing keys and replay/reuse keys
  according to `contracts/idempotency-conventions.md`.
- Error responses preserve `code`, `message`, `status`, `request_id`,
  `details`, `causes`, `retryable`, and optional `idempotency`.
- Missing core endpoints are treated as blockers for Phase 3 and Phase 4.

## Downstream Update Notes

- Phase 2 must expose contract schemas and DTOs for every endpoint listed in
  the mapping table.
- Phase 3 must scaffold SDK package exports for exactly these core methods and
  must include checks that prevent importing backend/domain/adapter/UI code.
- Phase 4 must implement methods that preserve direct HTTP behavior exactly,
  including `rescheduleReservation`.
- `rescheduleReservation` owns movement fields: slot/date/time, quantity, and
  resource assignment changes. `updateReservation` owns permitted non-slot
  fields such as customer snapshot, notes, metadata, status annotations, source
  references, and payment references.
- If any endpoint path, method name, DTO name, auth header, tenant/venue
  context rule, error code, idempotency rule, or package name changes, update
  `contracts/api-resource-list.md`, `contracts/sdk-method-list.md`, this phase,
  and all later SDK readiness phases before implementation continues.
