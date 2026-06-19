# Phase 1 Backend Module Boundary Results

This document executes Phase 1 from the frontend/backend/SDK separation plan.
It is documentation-only and defines backend ownership before runtime code is
moved.

## Boundary Decision Summary

The current packages are useful foundations, but their public meaning changes
under the backend-platform architecture:

- `@project-play/reservations-core` is a backend domain foundation, not the SDK.
- `@project-play/reservations-supabase` is a backend storage adapter, never a
  frontend or SDK dependency.
- `@reservation-platform/ai-chat` is the backend-owned optional chat package.
  `@project-play/reservation-chat-core` remains compatibility/reference
  migration context. Only selected public DTOs may appear in an optional SDK
  chat namespace through contract types.
- `app/api/**` reservation routes are migration shims. They should be replaced
  by backend-platform `/v1` routes, not copied as final architecture.
- `lib/supabase*`, `lib/langchain/**`, and compatibility helpers in `lib/**`
  are backend-only or host-app-only implementation details.

## Backend Module Ownership Table

| Backend module | Current source | Target owner | Public surface | Must not expose |
| --- | --- | --- | --- | --- |
| Reservation domain | `packages/reservations-core/src/**` | Backend platform domain package, future `@reservation-platform/domain` or equivalent | Backend service interfaces, domain tests, selected DTO source inputs | React, Next.js, Supabase clients, storage rows, SDK request helpers |
| Contract types | Selected DTO concepts from `packages/reservations-core/src/types.ts` plus API contract docs | Backend platform contract package, `@reservation-platform/contract-types` | Request/response DTOs, runtime schemas, error/idempotency shapes | Booking decisions, availability calculations, Supabase row names |
| Reservation application services | Current orchestration in `app/api/availability/route.ts`, `app/api/bookings/**`, `app/api/seat-maintenance/route.ts` | Backend platform service layer | Service methods behind `/v1` routes | Frontend route assumptions, UI copy, Next.js page dependencies |
| Storage adapter | `packages/reservations-supabase/src/**`, `packages/reservations-supabase/sql/**` | Backend platform storage adapter, future `@reservation-platform/adapter-supabase` | Backend repository implementation, migrations/RPC assets, adapter fixtures | SDK exports, browser config, direct frontend install requirement |
| Compatibility adapter | `lib/availability.ts`, `lib/reservation-capacity.ts`, `lib/seat-maintenance.ts`, legacy field bridges | Backend platform compatibility adapter during migration | Mapping between legacy seat fields and generic resource DTOs | Permanent SDK contract, UI display state |
| API auth and errors | Concepts in `app/api/api-utils.ts` | Backend platform API utilities plus host-specific Next.js adapter | Auth result model, platform error serialization, status mapping | Cookie/session implementation as public SDK behavior |
| Runtime config and service clients | `lib/supabase-admin.ts`, parts of `lib/supabase.ts`, environment access | Backend platform runtime config | Server-only client factories and secret validation | Browser bundles, SDK options, public frontend imports |
| Optional booking chat service | `packages/ai-chat/src/**`, plus `app/api/chat/**`, `lib/langchain/chat-agent.ts`, `lib/langchain/prompts.ts`, `lib/langchain/vector-store.ts`, and `packages/reservation-chat-core/src/**` as migration/reference context | Backend platform optional chat module | `/v1/chat/**` routes, backend workflow service, optional SDK chat DTOs | LangChain/provider SDKs in frontend or SDK, chat UI components |
| Analytics/report AI | `app/api/analytics-*`, `lib/langchain/analytics-agent.ts`, `lib/langchain/sales-report-pipeline.ts` | Non-platform app backend unless separately scoped | Explicit exclusion register or separate analytics module | Reservation SDK core behavior |
| Content/blog/update APIs | `app/api/content-posts.ts`, `app/api/blogs/**`, `app/api/updates/**`, `lib/content-posts.ts` | Current frontend/CMS ownership unless separately scoped | Explicit exclusion register | Reservation backend platform core |

## Backend-Only Import Policy

Frontend and SDK code must not import:

- `@project-play/reservations-supabase`
- future `@reservation-platform/adapter-supabase`
- `lib/supabase-admin.ts`
- server-only Supabase clients or service-role config
- `lib/langchain/**`
- model provider SDKs, vector-store adapters, or retrieval internals
- `app/api/**` route handlers or route utility modules
- backend application services
- database migrations, SQL files, table constants, RPC names, or row adapters

SDK code may import only:

- `@reservation-platform/contract-types`
- SDK-local helpers
- standard `fetch` or caller-provided `fetch`
- optional SDK chat DTOs that remain provider-free

The current Next.js app may temporarily import backend shims while migration is
in progress, but every such import must have a Phase 3, Phase 4, Phase 5, or
Phase 6 removal target.

## Package Rename And Migration Decisions

| Current name | Target meaning | Migration decision |
| --- | --- | --- |
| `@project-play/reservations-core` | Backend domain foundation | Keep as current workspace package during migration; future backend repo should rename or wrap as `@reservation-platform/domain`. |
| `@project-play/reservations-supabase` | Backend Supabase storage adapter | Keep backend-only; future backend repo should rename or wrap as `@reservation-platform/adapter-supabase`. Never publish as the frontend integration path. |
| `@reservation-platform/ai-chat` | Backend-owned optional AI chat interfaces/workflow ports | Keep as the optional backend chat package; expose only selected DTOs through contracts/SDK if needed. |
| `@project-play/reservation-chat-core` | Legacy chat contracts/tool helpers | Keep only as compatibility/reference migration context while `packages/ai-chat` becomes the backend-owned optional chat package. |
| `lib/reservations/**` | In-app compatibility re-export bridge | Retire after frontend imports contract types or SDK. Do not preserve as public API. |
| `app/api/**` reservation routes | Current backend shim | Replace with backend-platform `/v1` routes. Do not copy current route shape as final contract without mapping to API resource docs. |
| `@reservation-platform/sdk` | Frontend-safe HTTP client | New package; must not depend on the current `@project-play/*` backend packages. |
| `@reservation-platform/contract-types` | Public DTO/schema source | New package or generated output; may derive from domain concepts but must not export backend rule functions. |

## Compatibility Helper Disposition

| Current helper | Current role | Disposition | Target phase |
| --- | --- | --- | --- |
| `lib/reservations/**` | Re-export bridge to `@project-play/reservations-core` and adapter package | Remove after frontend/admin imports SDK or contract types directly | Phase 2 and Phase 3 |
| `lib/availability.ts` | Legacy availability compatibility helpers | Move needed generic behavior to backend domain/application services; map legacy fields at API boundary | Phase 1 then Phase 3 |
| `lib/reservation-capacity.ts` | Legacy capacity and seat/resource naming helper | Move generic logic to domain service; keep legacy alias mapping only as backend compatibility adapter | Phase 1 |
| `lib/seat-maintenance.ts` | Seat maintenance compatibility behavior | Convert to generic resource maintenance backend adapter | Phase 1 and Phase 3 |
| `app/api/api-utils.ts` | Next.js auth/error helper | Split platform error/auth concepts from Next.js-specific handler glue | Phase 4 |
| `app/api/chat/chat-config.ts` | Project Play chat defaults | Keep host-owned copy/config; backend chat accepts tenant config | Phase 5 |

## Backend Module Test Strategy

| Test group | Scope | Must avoid | Initial source candidates |
| --- | --- | --- | --- |
| Domain unit tests | Availability, validation, lifecycle decisions, resource policy rules | Supabase clients, Next.js route handlers, UI components | `packages/reservations-core/src/**/*.test.ts` |
| Storage adapter tests | Row mapping, repository behavior, RPC result/error mapping | Browser SDK assumptions, frontend components | `packages/reservations-supabase/src/index.test.ts` |
| API/application service tests | `/v1` service orchestration, DTO mapping, error/idempotency behavior | UI forms/pages, current route paths as final contract | Future backend service tests plus route parity fixtures |
| Compatibility adapter tests | Legacy seat/resource alias mapping and migration behavior | Permanent SDK/public API dependence on legacy fields | Existing route tests and new backend adapter fixtures |
| Runtime config tests | Server-only env validation, service-role access isolation | Browser bundles and SDK package imports | `lib/supabase-admin.test.ts` as source pattern |
| Optional chat tests | Provider-free DTO parsing, disabled-module behavior, stream/direct HTTP parity | LangChain/provider packages in SDK tests | `packages/ai-chat/src/**/*.test.ts`, `packages/reservation-chat-core/src/**/*.test.ts`, and `app/api/chat/**/*.test.ts` as source context |

## Import-Check Proposal

Add import checks in later implementation phases:

| Check | Fails when | Target phase |
| --- | --- | --- |
| Frontend source check | Browser-facing app/components import `@project-play/reservations-supabase`, `lib/supabase-admin`, `lib/langchain`, backend services, or SQL files | Phase 3 and Phase 4 |
| SDK source check | SDK imports `@project-play/*` backend packages, Supabase, Next.js, React, LangChain, route handlers, storage adapters, or current app internals | Phase 2 |
| Packed SDK check | Packed tarball contains backend-only dependencies, SQL/migrations, route handlers, or provider SDKs | Phase 2 and Phase 6 |
| Backend module check | Backend API/domain/skeleton source imports frontend components, Next.js pages, React UI, browser helpers, or SDK request helpers | Phase 1; `backend-platform:verify-extraction-boundary` now scans `packages/reservation-platform-api/src` and `apps/api/src` alongside the other backend candidate source surfaces |
| Optional chat SDK check | SDK chat namespace imports LangChain, model provider SDKs, vector-store adapters, or provider keys | Phase 5 |
| AI chat provider-neutral check | `@reservation-platform/ai-chat` or reference `@project-play/reservation-chat-core` source/package manifests import provider/runtime/frontend packages, current app internals, server env markers, or host-owned Project Play/Malaysia copy | Phase 5 implemented by `corepack pnpm run backend-platform:verify-chat-boundary` |

## Phase 0 Candidate Resolution

| Phase 0 backend candidate | Owner after Phase 1 | Notes |
| --- | --- | --- |
| Reservation domain contracts and rules | Backend domain module | Keep framework-neutral; derive public DTOs separately. |
| Supabase repository adapter and SQL | Backend storage adapter module | Backend-only and migration-owned. |
| Reservation route implementations | Backend API/application service module | Reimplement as `/v1`; current routes remain shims. |
| Venue catalog route behavior | Backend tenant/venue catalog where generic; host/frontend where Project Play copy-specific | Split generic config from brand/content. |
| Compatibility resource naming helpers | Backend compatibility adapter | Temporary until generic resource DTOs replace legacy seat aliases. |
| AI chat contracts, workflow ports, and tool descriptors | Optional backend chat module in `packages/ai-chat`; selected DTOs may become public contracts | Provider-free DTOs only can cross SDK boundary. Legacy `reservation-chat-core` descriptors are migration context, not the target backend chat package. |
| LangChain booking adapter | Optional backend chat adapter | Backend-only provider and retrieval ownership. |
| Auth/API utility concepts | Backend API utility plus host Next.js adapter | Split in Phase 4. |
| Analytics/report AI code | Explicit non-platform exclusion unless separately scoped | Track in Phase 6 exclusion register. |
| Content/blog/update APIs | Explicit non-platform exclusion | Track in Phase 6 exclusion register. |

## Downstream Updates Required

Phase 2 must enforce that `@reservation-platform/sdk` does not import current
`@project-play/*` backend packages. Phase 3 must treat current reservation
`app/api/**` routes as compatibility shims. Phase 4 must split server-only
Supabase access from browser auth UX. Phase 5 must keep LangChain/provider
internals backend-only. Phase 6 must keep analytics/report and content routes
out of the reservation-platform release unless they are separately scoped.

## Implementation Progress

The current branch now includes an initial Next.js-hosted `/api/v1`
compatibility layer. This is not the final extracted backend repository, but it
creates a platform-shaped HTTP boundary that the SDK and future frontend
migration can target while existing storage behavior remains in place.

Added runtime surfaces:

| Surface | Current implementation |
| --- | --- |
| `/api/v1/metadata` | Returns API version and enabled module metadata. |
| `/api/v1/venues`, `/api/v1/venues/{id}` | Dispatches through a framework-neutral catalog request handler in `@reservation-platform/api`, reads existing venue rows through an injected repository port, and adapts to platform venue DTOs. |
| `/api/v1/services`, `/api/v1/services/{id}` | Dispatches through a framework-neutral catalog request handler in `@reservation-platform/api`, reads existing service rows through an injected repository port, and adapts to platform service DTOs. |
| `/api/v1/resources` | Dispatches through a framework-neutral catalog request handler in `@reservation-platform/api`, forwards the optional `service_id` filter through an injected repository port, reads `reservable_resources` rows, and adapts to platform resource DTOs. |
| `/api/v1/resource-layouts/{id}` | Dispatches through a framework-neutral catalog request handler in `@reservation-platform/api`, reads resource layout metadata through an injected repository port, and adapts to platform layout DTOs. |
| `/api/v1/availability` | Calls a framework-neutral `listAvailability` application service in `@reservation-platform/api`. The package service prepares and validates public query parameters, lazily reads through an injected `AvailabilityRepositoryPort`, generates slots, applies metadata/default-label behavior, adapts `timeSlots` to `{ slots }`, and shapes platform errors. The Next route now only supplies the current repository factory, logs service causes, and serializes `Response.json(...)`. |
| `/api/v1/reservations*` | List and read-by-id orchestration now run through framework-neutral application-service functions in `@reservation-platform/api` backed by an injected `ReservationReadRepositoryPort`. Those package services own search normalization, the legacy-compatible search filter expression, search-only limit decision, UUID validation, repository error classification, and platform DTO/error response shaping. Create, update, cancel, and reschedule mutation orchestration now also runs through framework-neutral `@reservation-platform/api` functions backed by injected repository ports. The create service owns legacy create validation, legacy booking-to-reservation conversion, atomic result/error mapping, and platform DTO/error body shaping through `ReservationCreateRepositoryPort`; update/cancel/reschedule services own UUID validation, legacy update patch schema validation, `updated_at` stamping, cancel status construction, not-found/generic repository error classification, and platform DTO/error response shaping through `ReservationMutationRepositoryPort`. The current Next compatibility files now keep auth preflight, storage package repository factory wiring, create repository construction, resource-id label resolution for create/reschedule preparation, and JSON serialization. `createSupabaseReservationReadRepository()` preserves `*, services(name)`, descending `booking_date` ordering, search filter application, search-only `limit(100)`, `id` equality, and `.single()` behavior inside `@project-play/reservations-supabase`. `createSupabaseReservationMutationRepository()` preserves the authenticated `bookings.update(patch).eq("id", reservationId).select().single()` query shape while receiving already prepared patches from the package service. Reschedule preserves missing-idempotency, auth preflight, body parsing, idempotency claim, resource-id-to-label lookup, and legacy patch preparation ordering before calling the same package update orchestration as PATCH. Create preserves missing-idempotency before body parsing, public create input preparation, resource-id-to-label lookup ordering, lazy Supabase repository construction after legacy validation, atomic create execution through `createSupabaseReservationRepository(supabaseAdmin()).createReservationAtomic(...)`, and direct 201 platform reservation DTO responses without legacy response double mapping. Resource-id-to-label storage lookup now lives in `createSupabaseReservationResourceLabelRepository()` from `@project-play/reservations-supabase`, while the Next.js helper still owns JSON parsing, legacy DTO transformation, and compatibility routing. `PATCH` rejects movement fields so rescheduling uses the dedicated route. |
| `/api/v1/resource-maintenance` | Lists legacy seat maintenance rows and executes create/end mutations through framework-neutral resource-maintenance application-service functions in `@reservation-platform/api`. Those services use an injected repository port, call `createSupabaseResourceMaintenanceRepository()` from the Next host, preserve create-time service support, label normalization, legacy row construction, repository error classification, empty list behavior, and platform DTO mapping. The Next routes now keep only service-id/body schema validation, protected auth/idempotency ordering, Supabase repository construction, and `Response.json(...)` host glue. |

The current compatibility implementation lives under `app/api/v1/**`, with
pure mapping helpers in `app/api/v1/platform-adapters.ts`. It still depends on
current Next.js route handlers and current host Supabase clients, so it does
not satisfy the final backend repo split yet. The separate `apps/api`
standalone skeleton proves a backend-owned route host can dispatch the same
package services through injected repositories and optional Node HTTP/runtime
config, but only with fake repositories and source-boundary/runtime-config
tests.

The current `/api/v1` catalog database query logic for venues, services,
resources, and resource layouts now lives behind
`createSupabasePlatformCatalogRepository()` in
`@project-play/reservations-supabase`. The Next.js catalog repository shim only
wires the current anon Supabase client for venue/service reads and service-role
Supabase client for resource/layout reads. This is a bounded storage-adapter
slice, not a standalone backend extraction.

Catalog route orchestration for venues, services, resources, and resource
layouts now also lives in `@reservation-platform/api` through
`handlePlatformCatalogRequest()`. The package owns catalog endpoint matching,
trailing-slash normalization, id decoding, `service_id` resource filter
extraction, missing-repository error shaping, repository-port dispatch, and
platform DTO/error result shaping. The current Next.js route files call shared
`app/api/v1/catalog-route.ts` glue that wires the current repository factory
and serializes `NextResponse.json(...)`; `apps/api` uses the same package
dispatcher and converts the plain result into its standalone JSON response.
This is still a compatibility-host slice and does not prove live standalone
backend parity.

The current `/api/v1/availability` storage query logic lives behind
`createSupabaseAvailabilityRepository()` in
`@project-play/reservations-supabase`. The adapter preserves the legacy
compatibility query shapes, including the service-id-filtered
`resource_layouts` `maybeSingle()` read, while local `/api/v1` factory glue
owns the current host Supabase client wiring. Availability orchestration now lives in
`@reservation-platform/api` behind a neutral `AvailabilityRepositoryPort`: the
package owns query preparation, lazy repository access, slot generation,
legacy fallback label behavior, availability metadata extraction, platform DTO
mapping, and not-found/internal-error result shaping. The route is now host
glue that passes the repository factory, logs service causes when present, and
returns `Response.json(...)`. This removes legacy route delegation and direct
route imports of core generation or storage helper functions, but it is not yet
a standalone backend host or live backend parity proof.

The `/api/v1` route utility layer now centralizes the current protected-route
Supabase auth preflight used by existing protected reservation and resource-
maintenance mutations. This removes duplicated Next.js route glue around the
host `requireAuthenticatedSupabase()` helper while preserving the same
platform-shaped 401 behavior and the existing idempotency ordering. It is still
host Supabase auth, not extracted backend user-token verification.

Reservation create/reschedule compatibility shims now resolve requested
resource ids through `createSupabaseReservationResourceLabelRepository()` in
`@project-play/reservations-supabase`. The adapter owns the
`reservable_resources` table, `id, label` select, and `in("id", ids)` filter;
the Next.js helper keeps only the compatibility DTO rewrite from
`resource_ids`/`reservation_items` into legacy labels. This is a partial
storage-coupling reduction for mutation preparation; the actual create,
read, and mutation Supabase adapters now also live in the storage package.

Reservation list/read-by-id orchestration now lives in framework-neutral
application-service functions in `@reservation-platform/api` instead of the
Next compatibility files. The package defines `ReservationReadRepositoryPort`
and exposes `listReservations` plus `readReservationById`; those services
import no Next.js, Supabase, app route modules, SDK code, or React. They own
trimmed 100-character search normalization, the legacy-compatible search filter
expression with `\`, `%`, `_`, and `"` escaping, the search-only `limit(100)`
decision, UUID validation, not-found/generic repository error mapping, and
platform DTO/error body shaping. The current app-local compatibility files now
only perform auth preflight, instantiate the Supabase-backed repository bridge
from `@project-play/reservations-supabase`, and return
`NextResponse.json(...)`. The storage adapter's
`createSupabaseReservationReadRepository()` preserves the current authenticated
`bookings` query behavior, including the `*, services(name)` select,
descending `booking_date` order, search filter application, search-only limit,
`id` equality, and `.single()` behavior.

Reservation update/cancel/reschedule orchestration now runs in
`@reservation-platform/api` behind a framework-neutral
`ReservationMutationRepositoryPort`. The package validates reservation UUIDs,
validates already prepared legacy update patches against the compatibility
schema, stamps `updated_at`, builds the cancel `{ status: "cancelled" }`
patch, classifies not-found/generic repository errors, and maps successful rows
to platform reservation DTOs. The local
`reservation-update-compatibility.ts` and
`reservation-cancel-compatibility.ts` files are now host glue: they reuse the
Supabase context from `requirePlatformAuthenticatedSupabase`, wire
`createSupabaseReservationMutationRepository()` from
`@project-play/reservations-supabase`, call the package service, and serialize
the plain result with `Response.json(...)`. The storage adapter preserves the
authenticated `bookings.update(patch).eq("id", reservationId).select().single()`
query shape. The `/api/v1` PATCH route keeps the existing public patch
preparation and idempotency envelope and does not re-read the consumed request
body. The reschedule route still validates the public reschedule body, resolves
resource ids to legacy labels, prepares the legacy update patch, and then calls
the same package update orchestration used by PATCH. This removes the final
reservation lifecycle import of the legacy booking `[id]` route while moving
the mutation service boundary into the backend package.

Reservation create execution now also runs through `@reservation-platform/api`
behind a framework-neutral `ReservationCreateRepositoryPort`. The package
validates the prepared legacy create input, converts it into the core-compatible
reservation shape, maps atomic create errors to platform status/message/details,
and maps successful bookings directly to the platform reservation DTO with
status 201. The local `reservation-create-compatibility.ts` file is now host
glue: it lazily constructs `createSupabaseReservationRepository(supabaseAdmin())`
through `reservation-repository.ts` only after package validation succeeds,
calls the package service, and serializes the plain result with
`Response.json(...)`. The `/api/v1` POST route still preserves missing-
idempotency-before-body parsing, public create input preparation, and
resource-id label resolution ordering, but it no longer runs
`platformResponseFromLegacy` for create success or error responses.

Public reservation service errors emitted by `@reservation-platform/api` now use
generic reservation/resource language rather than booking/seat copy for create
validation, atomic resource-label/capacity conflicts, list/read failures,
update failures, and cancel failures. Atomic resource conflict details include
generic `resource_labels` and capacity errors include generic
`available_quantity`; the legacy `seat_labels` and `available_seats` detail
keys remain as compatibility aliases while current storage rows, fixtures, and
legacy adapter internals still use booking/seat field names until the final
DB/API migration.

Resource-maintenance list/create/end behavior now uses backend-owned
application-service functions in `@reservation-platform/api`. The package
defines a small `ResourceMaintenanceRepositoryPort` matching the methods
needed from `createSupabaseResourceMaintenanceRepository()` and exposes
`listResourceMaintenance`, `createResourceMaintenance`, and
`endResourceMaintenance`. These functions are framework-neutral: they import
neither Next.js, Supabase, app route modules, SDK code, nor React. They own the
active-row list result mapping, create-time resource resolution and service
policy preparation, legacy row construction, repository error
classification, end mutation classification, and platform DTO shaping. The
`/api/v1/resource-maintenance` and `/api/v1/resource-maintenance/[id]/end`
routes now validate URL/body inputs, preserve protected auth and idempotency
ordering, instantiate the Supabase adapter with the authenticated host client,
call the package services, and serialize their plain result objects with
`Response.json(...)`.

Remaining Phase 1 work:

- Extract these platform route handlers into backend-owned application services; `/api/v1/availability` orchestration now lives in framework-neutral `@reservation-platform/api` behind an injected availability repository port, catalog list/read orchestration for venues/services/resources/resource-layouts now lives in framework-neutral `@reservation-platform/api` behind an injected catalog repository port, `/api/v1/reservations` list/read-by-id plus create/update/cancel/reschedule orchestration now lives in framework-neutral `@reservation-platform/api` application services behind repository ports, and `/api/v1/resource-maintenance` list/create/end orchestration now lives in framework-neutral `@reservation-platform/api` application services.
- Split Next.js handler glue from backend service logic.
- Replace legacy booking/seat naming with generic resource service contracts.
  Public `@reservation-platform/api` reservation error bodies now use generic
  reservation/resource messages and generic detail aliases while preserving
  legacy detail keys for compatibility; DB fields, fixtures, and compatibility
  adapter internals still need the final schema/API migration.
- Replace the current Next.js compatibility route auth with the standalone
  bearer-token/JWT auth path after live provider configuration and tenant/RLS
  proof exist. The standalone skeleton has provider-neutral service-token and
  JWT/JWKS verifier readiness only.
- Move remaining storage access behind backend repository interfaces rather
  than route files. Catalog reads for the current `/api/v1` shim now use the
  Supabase storage adapter and package-owned catalog request dispatcher, and `/api/v1/availability` reads now use a
  compatibility Supabase availability adapter wired through local `/api/v1`
  factory glue instead of direct route imports of app Supabase helpers.
  Reservation create/reschedule resource-label lookup now uses a Supabase
  storage adapter too. Resource-maintenance list/create/end table access now
  uses the Supabase adapter and framework-neutral package application
  services. Availability now uses a package repository port and package-owned
  orchestration while the current Supabase availability adapter remains wired
  through local host factory glue. Reservation list/read-by-id and
  update/cancel/reschedule now use package repository ports backed by Supabase
  read/mutation adapters in `@project-play/reservations-supabase`, and
  reservation create now uses a package create repository port backed by the
  existing Supabase reservation repository.
- Replace compatibility-level reservation create/update/cancel/reschedule
  mapping with true backend application service commands. Create, cancel, and
  reschedule preparation plus create/update/cancel/reschedule mutation
  orchestration are now framework-neutral in `@reservation-platform/api`; list
  and read-by-id also have package-owned application services. The reservation
  read and update-style mutation Supabase adapters now live in the storage
  package. Remaining work is to prove the services in a standalone backend
  host.
- Finish route-wide adoption of backend-owned repository/service interfaces
  for the remaining reservation, availability, and resource lifecycle paths.
- Prove live database/RLS/deploy parity from a standalone backend
  service/repository. `apps/api` is a source-boundary, fake-repository,
  idempotency, auth/context, and runtime-config skeleton proof only; the
  current app remains the live host for compatibility routes.
