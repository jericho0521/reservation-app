# Phase 2: Contract Types Package

## Purpose

`@reservation-platform/contract-types` already exists locally with generated
OpenAPI and JSON Schema artifacts. The remaining work is publication, live
release validation, and final standalone extraction as the shared public
contract source for the backend `/v1` API and `@reservation-platform/sdk`.

The package owns API request/response DTOs, runtime schemas, error shapes, and
idempotency metadata. It does not own booking rules, availability calculations,
persistence rules, Supabase mappings, or frontend display state.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/sdk-readiness/README.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-0-sdk-boundary-reset.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-1-backend-api-prerequisite.md`
- `docs/package-refactor/backend-platform-extraction/contracts/api-resource-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/sdk-method-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/error-conventions.md`
- `docs/package-refactor/backend-platform-extraction/contracts/idempotency-conventions.md`

## Write Scope

Implementation work belongs in:

- `reservation-platform-backend/packages/contract-types`
- generated OpenAPI/JSON Schema artifacts owned by the contract package
- tests and examples for contract validation

For this planning pass, edit only this phase doc if Phase 2 assumptions change.
Do not edit backend domain packages, storage adapters, SDK implementation,
current frontend UI, or other phase docs unless explicitly assigned.

## Non-Goals

- Do not put reservation conflict, availability, capacity, lifecycle, payment,
  or policy rules in contract schemas.
- Do not encode Supabase table names, RPC names, row types, migrations, or
  adapter-specific fields in public DTOs.
- Do not import from `@reservation-platform/domain`,
  `@reservation-platform/adapter-supabase`, current `app/**`, `components/**`,
  `lib/**`, or host-app `types/**`.
- Do not make the SDK depend on generated backend implementation code.
- Do not create UI models, form state, localized labels, analytics widgets, or
  current app display contracts.
- Do not add optional chat/payment/report/content contracts to the core export
  unless the corresponding optional module phase scopes them.

## Contract Ownership

`@reservation-platform/contract-types` is the public DTO boundary between
direct HTTP callers, the backend API, and the SDK.

| Consumer | May import from contract types | Must not import |
| --- | --- | --- |
| Backend `/v1` API | Runtime schemas, DTO types, error shapes, idempotency metadata, OpenAPI inputs | SDK client helpers, frontend UI, generated SDK request code |
| SDK package | Public DTO types, runtime schemas when useful for response/error typing | Backend domain rules, storage adapters, route handlers |
| Domain package | Prefer domain-native models only; may map at API boundary instead of importing DTOs | API DTOs as business-rule inputs, SDK types, frontend types |
| External frontend | Public DTO types directly or via SDK re-exports | Domain packages, storage adapters, database rows |

DTOs describe transport data. Domain packages decide what the data means.
Mapping between DTOs and domain models belongs in backend API/application
service code, not in the SDK and not in the contract package.

## Generated Versus Source Schemas

Use one explicit source of truth for public contracts:

- Source schemas: human-maintained runtime schemas in
  `packages/contract-types/src/**`.
- Inferred TypeScript types: exported from source schemas where practical.
- Generated artifacts: OpenAPI/JSON Schema files generated from source schemas.
  The current package writes
  `packages/contract-types/contracts/openapi.json` and
  `packages/contract-types/contracts/json-schema/*.schema.json`.
- Generated artifacts are checked by `contracts:check` so drift cannot pass
  silently; source schemas remain the reviewed contract. The backend API
  consumes and may publish these package-owned artifacts, but it must not own a
  parallel generated artifact source.

If the implementation chooses OpenAPI as the source of truth instead, update
this phase and Phase 3/4 before coding so the SDK knows whether it imports
source schemas, generated types, or both.

## DTO Naming

Use stable public names that match the resource list and SDK method list:

- Context and metadata: `RequestContext`, `MetadataResponse`,
  `TenantResponse`.
- Venues: `ListVenuesQuery`, `ListVenuesResponse`, `VenueResponse`.
- Services: `ListServicesQuery`, `ListServicesResponse`, `ServiceResponse`.
- Resources: `ListResourcesQuery`, `ListResourcesResponse`,
  `ResourceResponse`, `ResourceLayoutResponse`.
- Availability: `AvailabilityQuery`, `AvailabilitySlot`,
  `AvailabilityResponse`.
- Reservations: `CreateReservationInput`, `ReservationResponse`,
  `ListReservationsQuery`, `ListReservationsResponse`,
  `UpdateReservationPatch`, `CancelReservationInput`,
  `RescheduleReservationInput`.
- Customer: `CustomerSnapshot`.
- Resource maintenance: `ListResourceMaintenanceQuery`,
  `ListResourceMaintenanceResponse`, `ResourceMaintenanceResponse`,
  `CreateResourceMaintenanceInput`, `EndResourceMaintenanceInput`.
- Errors and idempotency: `PlatformErrorBody`, `PlatformErrorResponse`,
  `PlatformErrorCode`, `IdempotencyMetadata`, `IdempotencyStatus`.

`ReservationResponse` is the canonical public DTO name. Treat
`ReservationResult` in older planning notes as a conceptual alias only; do not
export both names unless a later compatibility decision explicitly requires an
alias.

`RescheduleReservationInput` owns movement fields such as slot/date/time,
`start_at`, `end_at`, `quantity`, `resource_ids`, and `reservation_items`.
`UpdateReservationPatch` owns permitted non-slot fields such as customer
snapshot, notes, metadata, status annotations, source references, and payment
references. Contract schemas should reject movement fields in
`UpdateReservationPatch`.

Naming rules:

- Use `Input` for JSON request bodies.
- Use `Query` for URL query DTOs.
- Use `Response` for complete HTTP success payloads.
- Use `Patch` for partial update bodies.
- Use snake_case JSON fields in DTO payloads when the HTTP contract uses
  snake_case.
- Avoid database row suffixes such as `Row`, `RpcResult`, or table-specific
  names in public contracts.

## API And SDK Consumption

- The backend API imports runtime schemas to validate request bodies, query
  params, path params where useful, and serialized response DTOs.
- The SDK imports public DTO types and may import lightweight schemas for error
  parsing or optional validation, but must not import backend route handlers.
- The SDK should re-export useful public contract types from
  `@reservation-platform/sdk` for consumer convenience without becoming the
  contract owner.
- Direct HTTP consumers can install `@reservation-platform/contract-types`
  without installing the SDK.
- Neither API nor SDK may use the contract package as a place for domain
  decisions such as slot availability, conflict resolution, capacity strategy,
  lifecycle permissions, or maintenance overlap rules.

## Implementation Steps

1. During standalone extraction, carry over the existing
   `packages/contract-types` package into
   `reservation-platform-backend/packages/contract-types` as
   `@reservation-platform/contract-types`; do not scaffold it from scratch.
2. Add runtime schema tooling consistent with the backend repo conventions.
3. Define common scalar helpers for IDs, timestamps, pagination, metadata,
   tenant/venue context, and correlation/request IDs.
4. Define DTO schemas for every core Phase 1 endpoint.
5. Define `CustomerSnapshot` as a reservation-scoped value object, not customer
   CRUD.
6. Define `PlatformErrorResponse` and idempotency metadata from the contract
   docs.
7. Export types and schemas from a small public `src/index.ts` surface.
8. Keep the existing local OpenAPI/JSON Schema generation and
   `contracts:check` drift protection passing for
   `packages/contract-types/contracts/openapi.json` and
   `packages/contract-types/contracts/json-schema/*.schema.json`; API
   publication, live release, and standalone extraction consume those
   package-owned artifacts as later work.
9. Add schema validation tests with valid and invalid example payloads.
10. Add dependency/import checks proving the contract package does not import
    backend domain, storage adapter, SDK, current app, React, or Next.js code.

## Deliverables

- `packages/contract-types` package plan and public export list.
- Source schema list covering all Phase 1 core endpoints.
- DTO naming inventory aligned with the endpoint-to-SDK mapping.
- Generated artifact path:
  `packages/contract-types/contracts/openapi.json` and
  `packages/contract-types/contracts/json-schema/*.schema.json`, with
  `contracts:check` drift protection.
- Schema validation and forbidden import test plan.

## Acceptance Criteria

- The backend API can validate `/v1` requests and serialize responses with
  schemas from `@reservation-platform/contract-types`.
- The SDK can type all core methods by importing public DTOs from
  `@reservation-platform/contract-types`.
- Direct HTTP consumers can install the contract package independently.
- Contract schemas contain no booking rules, database row details, Supabase
  concepts, UI state, React/Next.js imports, or SDK client helpers.
- DTO names exist for `rescheduleReservation` and every other Phase 1 core
  endpoint.
- Generated artifacts cannot drift silently from source schemas.

## Downstream Update Notes

- Phase 3 must depend on `@reservation-platform/contract-types` and re-export
  selected DTO types from `@reservation-platform/sdk`.
- Phase 4 must use these DTO names for method inputs, query params, responses,
  `PlatformError`, and idempotency options.
- Phase 7 external smoke tests should prove a non-SDK HTTP consumer can import
  only `@reservation-platform/contract-types`.
- If DTO names, schema ownership, generated artifact strategy, package path, or
  package name changes, update Phase 1, Phase 3, Phase 4, and the contract docs
  before implementation continues.
