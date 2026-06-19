# Phase 6 External Frontend Proof and Removal Gate Results

This document executes Phase 6 as planning work. It defines the proof required
before local compatibility routes or direct backend imports can be removed.

## Required Proof Matrix

| Proof | Required evidence |
| --- | --- |
| Current frontend as consumer | Current app can run against backend `/v1` through SDK/direct HTTP mode. |
| Clean external frontend | Separate app installs SDK tarball/package and completes reservation flow. |
| Direct HTTP consumer | Separate app calls `/v1` without SDK and receives equivalent payloads/errors. |
| Browser safety | Bundle/source scans show no service-role keys, backend adapters, route handlers, LangChain, or Supabase storage clients in frontend/SDK. |
| Backend isolation | Backend owns database, idempotency, auth enforcement, migrations, and provider secrets. |
| Optional chat | Chat works through `/v1/chat/**` or returns `chat_module_disabled`. |

## Current Evidence

The branch has early SDK/package evidence, not full external proof:

| Evidence | Status |
| --- | --- |
| `@reservation-platform/contract-types` builds in `packages:test` | Passing. |
| `@reservation-platform/sdk` builds in `packages:test` | Passing. |
| SDK request construction tests | Passing for reservation create, platform tenant/venue headers, preserved platform errors, resource layout mapping, safe-read retry, abort non-retry, mutation non-retry, and chat stream URL mapping. |
| Initial runtime contract schemas | Passing for minimal reservation input, public platform errors, JSON-only error details, metadata constraints, typed resource layouts, and resource-aware service contracts. |
| New package forbidden source/dependency scans | Passing for `next`, `react`, `@supabase`, `@langchain`, `@project-play`, `app/`, and `lib/` strings. SDK source scan now walks every non-test SDK source file. |
| Package build and pack | Passing; `@reservation-platform/sdk` and `@reservation-platform/contract-types` tarballs are generated under `dist-packages/`. |
| Packed SDK and contract tarball scan | Implemented through `corepack pnpm run packages:verify-boundaries`; verifies required packed files, allows only `dist/*`, `package.json`, and `README.md`, blocks forbidden dependencies/import strings, and scans packed text files. |
| Backend `/v1` API parity | Partially implemented through the in-app compatibility layer; not final standalone backend parity. |
| Initial Next.js `/api/v1` compatibility layer | Partially implemented for metadata, catalog, resources, availability, reservations including dedicated reschedule routing, and resource maintenance list/create/end. Service and availability DTOs now preserve resource-selection metadata for assigned-resource frontends. `/api/v1/availability` no longer delegates to the legacy availability route for storage orchestration; its compatibility Supabase reads now live in `@project-play/reservations-supabase`, while the current Next route still wires host clients, generates slots, and maps the platform response. Resource-maintenance create policy now lives in `@reservation-platform/api` while other Supabase reads/writes remain route glue. This is not final backend extraction. |
| OpenAPI/JSON Schema generation | Implemented for local contract package artifacts. `@reservation-platform/contract-types` now owns `packages/contract-types/contracts/openapi.json` and `packages/contract-types/contracts/json-schema/*.schema.json`, generated from the package-local `src/contract-artifact-registry.ts`. `contracts:check` fails on stale or unexpected artifacts and is wired into the contract package test plus root `sdk:release-gate`. This is artifact generation/checking only, not final standalone backend extraction. |
| Current frontend source secret scan | Implemented through `corepack pnpm run current-frontend:verify-platform-secrets`, which scans the current browser/platform-facing frontend source surface for server-only secret/env markers and direct server Supabase imports. It is wired into root `sdk:release-gate` before package packing. This is source-level only and does not replace frontend bundle/manifest scans or backend secret enforcement. |
| Backend platform extraction source boundary | Implemented through `corepack pnpm run backend-platform:verify-extraction-boundary`, which scans current backend-platform candidate source surfaces: `app/api/v1`, `packages/reservations-core/src`, `packages/reservations-supabase/src`, `packages/ai-chat/src`, `packages/reservation-chat-core/src`, `packages/contract-types/src`, `packages/reservation-platform-api/src`, and `apps/api/src`. `packages/ai-chat` is the backend-owned optional chat source; `packages/reservation-chat-core` remains scanned as compatibility/reference migration context so it cannot drift into frontend/provider coupling while migration is incomplete. The gate blocks frontend pages/components, admin UI surfaces, React/client imports, browser globals, browser Supabase helpers, frontend platform client wrappers, and accidental Next/React imports in the standalone skeleton while allowing current `/api/v1` compatibility route glue such as `next/server`, legacy backend route adapters, and server Supabase helpers. It is source-level extraction hygiene only, not standalone backend parity. |
| Runtime idempotency repository wiring | Partially implemented for current `/api/v1` reservation and resource-maintenance compatibility mutations. Route helpers now resolve durable Supabase idempotency storage with `createSupabaseIdempotencyRepository(supabaseAdmin())` when backend service-role config is present and use a local/dev/test in-process compatibility fallback only when that config is absent. This is not proof that the SQL has been applied, RLS/tenant isolation works, or the standalone backend rollout is complete. |
| Standalone backend extraction manifest | Implemented through `corepack pnpm run backend-platform:verify-extraction-manifest`, backed by `docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json`, and wired into root `sdk:release-gate`. The manifest classifies move/copy candidates, compatibility shims, and exclusions for the future `reservation-platform-backend` repository. It now explicitly includes the backend-owned `apps/api` standalone skeleton, the backend-owned `packages/ai-chat` scaffold as an optional backend package move candidate, and the backend-owned `packages/database` package as a direct database package move candidate, while keeping `packages/reservation-chat-core` and the older root/package SQL assets as reference-only reconciliation inputs mapped by the SQL inventory and migration bundle manifests instead of as verbatim dry-run copies. The gate validates required fields, current-source path existence, allowed target repo areas, exclusion rationales, required exact backend package entries for `packages/ai-chat` and `packages/database`, blocks known frontend/current-app/admin/analytics/content/browser-helper paths from being marked as backend move/copy candidates, and forbids other move/copy entries from targeting at or under those explicit package roots unless every current path already comes from that same package subtree. This is extraction readiness only; it does not create or populate a standalone backend repository. |
| Standalone backend extraction dry run | Implemented through `corepack pnpm run backend-platform:verify-extraction-dry-run`, backed by the same extraction manifest, and wired into root `sdk:release-gate` immediately after the manifest shape check. The dry run enumerates move/copy candidate files into deterministic backend target paths, excludes generated/install/cache artifacts, reports compatibility shims as reimplementation references only, verifies excluded paths are not planned, and fails on ambiguous targets, collisions, invalid paths, frontend/current-app targets, or generated artifact inclusion. It now plans `apps/api`, `packages/ai-chat`, and `packages/database` directly while keeping the legacy `packages/reservation-chat-core` package out of the verbatim copy set and leaving current SQL sources as reconciliation/reference inputs mapped by the SQL inventory and migration bundle manifests instead of copying them into additional `packages/database` files. This is a read-only extraction-plan guardrail only; it does not copy files, populate a standalone backend repository, execute SQL, prove RLS, prove durable idempotency, or prove live parity. |
| Standalone backend app skeleton | Implemented as private workspace package `apps/api` with framework-neutral route handlers and an optional Node HTTP server entry. It imports `@reservation-platform/api` and `@reservation-platform/contract-types`, serves `GET /v1/metadata`, maps catalog `GET /v1/venues`, `/v1/services`, `/v1/resources`, and `/v1/resource-layouts/{id}` through an injected `PlatformCatalogRepository`, maps `GET /v1/availability` through an injected `AvailabilityRepositoryPort`, maps read-only `GET /v1/reservations` and `GET /v1/reservations/{id}` through an injected `ReservationReadRepositoryPort`, maps idempotent `POST /v1/reservations` through injected `ReservationCreateRepositoryPort` plus `IdempotencyRepository`, maps idempotent reservation lifecycle mutations (`PATCH /v1/reservations/{id}`, `POST /v1/reservations/{id}/reschedule`, and `POST /v1/reservations/{id}/cancel`) through injected `ReservationMutationRepositoryPort` plus `IdempotencyRepository`, maps `GET /v1/resource-maintenance` through an injected `ResourceMaintenanceRepositoryPort`, maps idempotent `POST /v1/resource-maintenance` and `POST /v1/resource-maintenance/{id}/end` through injected `ResourceMaintenanceRepositoryPort` plus `IdempotencyRepository`, and returns the stable `chat_module_disabled` platform error for disabled `/v1/chat/reservation-sessions/**` endpoints. Missing catalog, availability, reservation read, reservation create, reservation mutation, resource-maintenance, or idempotency repository configuration returns a stable platform error instead of importing current-app factories. `apps/api` now has backend-only Supabase runtime wiring readiness through `createStandaloneSupabaseDependencies()` and `createStandaloneSupabaseDependenciesFromEnv()`, using `RESERVATION_SUPABASE_URL`, `RESERVATION_SUPABASE_ANON_KEY`, and `RESERVATION_SUPABASE_SERVICE_ROLE_KEY` as backend-only config. Complete config wires anon/public and service-role/admin clients into `@project-play/reservations-supabase` adapters, including `createSupabaseTenantVenueRepository(adminClient)` for tenant/venue context validation; absent Supabase config preserves safe default errors; partial Supabase config fails closed. `RESERVATION_PLATFORM_SERVICE_API_KEY` now optionally enables backend-only service-token protection for catalog, availability, reservation, and resource-maintenance data routes, and `apps/api/src/jwt-verifier.ts` provides a standalone provider-neutral JWT/JWKS bearer verifier for non-service user tokens. `@reservation-platform/api` also exports `principalFromTokenClaims()` so verifier implementations can map already-decoded token claims into `AuthenticatedPlatformPrincipal` with configurable subject, tenant, venue, role, and scope claim names without importing provider SDKs. The skeleton rejects missing/non-bearer credentials before repository work, preserves wrong-service-token 403 behavior when no verifier is configured, lets a matching service token bypass the verifier as the internal service principal, sends other bearer tokens through the verifier, authorizes verifier principals with shared tenant/venue/role/scope helpers, validates tenant/venue mismatch or not-found through an injected `PlatformTenantVenueRepository`, fails closed on verifier throws without leaking provider details, and intentionally leaves metadata plus disabled chat routes unprotected. `corepack pnpm run backend-platform:verify-standalone-api-skeleton` builds required package types, type-checks the app, tests route behavior/query parsing/error mapping, create and lifecycle validation, resource-maintenance service delegation, resource-maintenance missing-key/malformed-JSON preparse behavior, resource-maintenance idempotency replay/misuse/non-commit behavior with fake repositories, service-token/context enforcement, standalone bearer verifier behavior, runtime config validation, Supabase client/adapter wiring with fakes, idempotency replay/misuse for reservation mutations, and source boundaries with fake repositories, and scans the skeleton source for frontend, Next.js, React, browser Supabase, LangChain/provider, and current-app wrapper imports. This is only a backend-only host skeleton, service-token readiness, provider-neutral JWT/JWKS verifier readiness, bounded JWKS cache/unknown-`kid` refresh behavior, decoded-claim mapping readiness, fake-repository idempotency proof, and runtime wiring proof; it does not prove live reservation parity, durable database-backed idempotency against a real database, migrations/RLS, live provider configuration, provider operational key rotation, enabled provider chat, deployment, or actual separate repo extraction. |
| Database SQL ownership and migration bundle assets | Implemented through `corepack pnpm run database:verify-sql-ownership` and `corepack pnpm run database:verify-migration-bundle`, backed by `database-sql-ownership-inventory.json`, `database-migration-bundle-manifest.json`, `packages/database/migrations/supabase/migration-index.json`, and the private `packages/database` workspace package. The gate checks every current `.sql` file under `supabase/` and `packages/reservations-supabase/sql/`, missing inventory targets, non-platform content/reporting terms classified as core, the known duplicate atomic RPC pair, ordered core migration target names, optional AI retrieval/development seed folder ownership, runnable target files under `packages/database`, deterministic migration-index paths/order/classification/checksums/byte sizes, and critical concrete SQL semantics for the package-owned extensions, tenant/auth, catalog, resource, booking, resource-maintenance, availability-rule, atomic reservation RPC, core RLS, core security hardening, and platform idempotency migrations. The package now carries runnable curated core schema SQL from `supabase/base-schema.sql`, including resource-maintenance and availability-rule assets, the canonical `public.create_reservation_atomic(payload jsonb)` RPC from `supabase/create-reservation-atomic.sql`, RLS policy SQL from `supabase/reservations-rls.sql`, package-owned function search-path/RPC privilege hardening from `supabase/security-hardening.sql`, durable idempotency table/RPC SQL from `packages/reservations-supabase/sql/platform-idempotency.sql`, and a generated package-owned apply-plan/checksum index. This is source/inventory plus package-asset hygiene only; it does not install migrations, execute SQL, prove tenant isolation/RLS behavior, prove live atomic reservation behavior, prove live seeded backend parity, prove durable database-backed idempotency, or complete standalone database extraction. |
| Database live/disposable migration proof readiness | Implemented through `corepack pnpm run database:live-proof`, with package-local aliases in `@reservation-platform/database`. The harness validates a disposable database env contract on every run, selects the backend-owned `packages/database` migration-index plan rather than legacy SQL paths, exits `0` with `SKIPPED` and makes no database connection when live database env or `psql` is absent/incomplete, and supports `database:live-proof:strict` / `RESERVATION_DATABASE_LIVE_STRICT=1` for fail-closed disposable DB proof runs. When fully configured, it applies package-owned core migrations through `psql -v ON_ERROR_STOP=1 -f ...`; optional AI retrieval migrations and development seeds are opt-in through explicit env flags. Focused tests cover skip/strict env validation, plan selection, and psql argument construction without requiring a real database. This is executable readiness for migration application only; it is not evidence that CI has run against a disposable database, not an RLS/tenant isolation behavioral proof, and not live durable idempotency or atomic reservation proof. |
| Optional AI chat backend scaffold | Implemented as private workspace package `@reservation-platform/ai-chat` under `packages/ai-chat`. It defines provider-neutral model generation/streaming events, tenant-scoped retrieval, checkpoint persistence, audit sink, tenant config, public-safe errors, and workflow dependency interfaces. Focused tests prove disabled/missing provider error mapping, stream-event normalization, optional injected retrieval/checkpoint behavior, and provider-error sanitization. `corepack pnpm run backend-platform:verify-chat-boundary` now scans both `packages/reservation-chat-core` and `packages/ai-chat` production source and manifests, and the standalone extraction manifest now treats `packages/ai-chat` as the direct backend move candidate while keeping `packages/reservation-chat-core` as reference-only migration context. This is a scaffold proof only; it does not run provider adapters, reservation tools, real retrieval/checkpoint persistence, live chat config, persistence-backed tenant isolation, or live enabled-chat backend parity. |
| Current frontend platform mode | Partially implemented for booking form service list, availability lookup, reservation creation, admin list/search, admin status updates, and resource-maintenance list/save through `lib/reservation-platform-client.ts`. Unit tests cover browser-safe tenant/venue/correlation forwarding and idempotency header preservation on platform wrapper requests. `corepack pnpm run current-frontend:platform-smoke` runs the current `/form-booking` UI with `NEXT_PUBLIC_RESERVATION_API_MODE=platform`, browser-intercepts mocked `/api/v1/services`, `/api/v1/availability`, and `/api/v1/reservations` create responses, asserts request context/idempotency, and fails on legacy `/api/*` reservation calls. `corepack pnpm run current-frontend:admin-platform-smoke` runs smoke-only admin harness routes with mocked `/api/v1` responses to prove admin list/search/status and resource-maintenance list/save browser wiring, platform tenant/venue/correlation headers, mutation idempotency headers, and no legacy reservation `/api/*` calls. The harness is guarded by `NEXT_PUBLIC_RESERVATION_PLATFORM_SMOKE=1` and returns `notFound()` otherwise, so it is not an auth bypass for normal `/admin` routes. Live seeded backend parity readiness now exists, but strict live proof is still required. |
| Clean external frontend install/smoke | Plain TypeScript local-tarball fixture implemented at `examples/sdk-plain-typescript-smoke` with SDK/direct HTTP parity plus manifest/source/secret boundary scans; server-to-server local-tarball fixture implemented at `examples/sdk-server-to-server-smoke` with server credential, retry/timeout, parity, and manifest/source/secret boundary scans; Vite/React local-tarball browser build fixture implemented at `examples/sdk-vite-react-smoke` with metadata, catalog, availability, create/read reservation, browser-safe auth, manifest dependency checks, and source/bundle forbidden-marker scans; separate Next.js local-tarball fixture implemented at `examples/sdk-next-external-smoke` with a minimal independent app tree, metadata, catalog, availability, create/read reservation, raw fetch replay/read parity on the same fixture-local `/v1` surface, manifest dependency checks, and source/build-output forbidden-marker scans; disabled-chat local-tarball fixture implemented at `examples/sdk-chat-disabled-smoke` with metadata/availability proof, exact `chat_module_disabled` preservation for all current SDK chat methods, header/idempotency checks, and fixture manifest/source boundary scans; enabled-chat local-tarball fixture implemented at `examples/sdk-chat-enabled-smoke` with metadata module reporting, session creation, JSON message action, NDJSON stream, confirmation `ReservationResponse`, header/idempotency forwarding, SDK/direct HTTP parity, and fixture boundary scans. Root `sdk:release-gate` verifies fixture manifests and lockfiles point at the current package-version tarballs, then installs and runs these fixtures from local tarballs in CI/deploy verification. Live backend smoke is still missing. |
| Packed SDK tarball scan | Implemented for exact current SDK and contract-types tarball versions through `corepack pnpm run packages:verify-boundaries`, and wired into `corepack pnpm run sdk:release-gate` before external fixture install/smoke. |
| Direct HTTP parity suite | Partial in plain TypeScript fixture with SDK/direct HTTP parity for metadata, availability, create/replay/key-misuse/read/error flows against the same in-memory `/v1` HTTP surface. Server fixture adds tenant, availability, create/list/idempotency, retry, timeout, and missing-credential proof. The Vite/React fixture adds browser bundle proof against a fixture-local `/v1` surface, but does not claim direct HTTP or live backend parity. The Next fixture adds direct raw-fetch replay/read parity for one mutation and one read against its fixture-local `/v1` surface, but does not claim live backend parity. The disabled-chat fixture adds direct raw-fetch error parity for all current SDK chat methods when the fake backend returns `chat_module_disabled`. The enabled-chat fixture adds direct raw-fetch parity for metadata module reporting, session creation, JSON message actions/prepared-reservation metadata, NDJSON stream chunks, and confirmation reservation payloads against a fixture-local fake `/v1/chat` backend, but does not claim real provider workflow or live backend parity. `corepack pnpm run sdk:live-parity` now validates live parity env shape and, when fully configured, compares SDK calls with direct HTTP for metadata, configured service, configured resource, availability, and reservation list/summary responses against the same live `/v1` backend. It exits `0` with a clear `SKIPPED` message and makes no live HTTP calls when live env is absent or incomplete. `corepack pnpm run sdk:live-parity:strict` is the strict live proof and fails if required env is missing or malformed, if mutation opt-in is absent, or if SDK/direct HTTP reservation create idempotency replay/read/list-summary parity differs. Strict readiness now also covers resource-maintenance list parity plus create and end idempotency replay through SDK/direct HTTP, including a clear failure if the create response lacks `maintenance_id`. Strict live backend parity is still unproven until that command passes against disposable seeded backend data. |

## Disabled Chat Proof

`examples/sdk-chat-disabled-smoke` is now the local-tarball proof for a backend
where chat is not enabled. Its fake metadata response omits chat while core
metadata and availability SDK calls still pass. Each current SDK chat method
calls the expected `/v1/chat` endpoint and throws `PlatformError` with a body
that exactly equals direct raw `fetch` for the same request path, JSON body,
tenant, venue, bearer auth, correlation ID, and idempotency key.

This proof supports the removal gate only for the disabled-chat case. It does
not satisfy live backend parity, private/public registry installation, real
provider workflow parity, retrieval/checkpoint behavior, or final backend
extraction.

## Enabled Chat Fixture Proof

`examples/sdk-chat-enabled-smoke` is now the local-tarball proof for a backend
where chat is enabled. Its fixture-owned fake `/v1/chat` backend returns public
contract payloads only: enabled module metadata, session creation, JSON message
actions, NDJSON stream chunks, and confirmation with a canonical
`ReservationResponse`.

The fixture compares every enabled chat SDK call with direct HTTP against the
same fake backend and asserts tenant, venue, bearer auth, correlation ID, and
idempotency forwarding. It also scans its manifest and source for LangChain,
provider SDKs, Supabase, Next.js, current app imports, and server-secret
markers.

This proof does not run LangChain, model providers, retrieval, checkpoint
persistence, live backend config, tenant isolation, or real seeded backend chat
workflow tests. The provider-neutral `@reservation-platform/ai-chat` scaffold
now proves injectable workflow contracts and public-safe event/error mapping,
but it is not a live enabled-chat provider proof.

## Removal Gate Checklist

- Backend `/v1` parity exists for every local reservation route being removed.
- SDK method-to-endpoint tests pass.
- Direct HTTP parity tests pass.
- Current frontend `platform` mode passes core flows.
- External clean frontend passes install and smoke flows.
- Forbidden import checks pass for frontend source, SDK source, and packed SDK.
- Rollback path is documented.
- Non-platform routes are listed in the exclusion register.

## Exclusion Register

| Surface | Status |
| --- | --- |
| Analytics/report AI routes and agents | Excluded from reservation-platform core unless separately scoped. |
| Content/blog/update APIs | Frontend/CMS-owned unless separately scoped. |
| Marketing/blog pages | Frontend-owned. |
| Admin/analytics UI | Frontend-owned UI; backend may expose APIs only if scoped. |

## CI Release Gate Plan

1. Build contract types.
2. Build SDK.
3. Run SDK unit and request-construction tests.
4. Run backend `/v1` contract tests.
5. Run backend source boundary and database SQL ownership inventory checks.
6. Run direct HTTP parity tests.
7. Pack SDK tarball.
8. Run packed package boundary scan.
9. Install tarball in external fixtures.
10. Run forbidden import/dependency scans.
11. Run current frontend platform-mode smoke.
12. Run optional chat enabled/disabled smoke when module is scoped.

The current aggregate `corepack pnpm run sdk:release-gate` implements the
local-tarball subset of this plan plus local contract artifact drift checking
and the current frontend platform-mode browser smoke:
OpenAPI/JSON Schema artifacts are checked before package tarball creation,
the current frontend browser/platform source secret scan runs, the backend
platform extraction candidate source boundary scan runs, the standalone backend
extraction manifest check, dry-run extraction-plan verifier, and standalone
`apps/api` skeleton proof run, the
database SQL ownership inventory check runs, package tarballs are created,
`database:live-proof` validates the disposable database migration proof env
contract and skips safely when no live database fixture is configured,
`sdk:live-parity` validates the live backend parity env contract and skips
safely when the live backend fixture is not configured, exact-version
packed boundary scan runs, fixture tarball manifest and lockfile checks run, external
fixture tarball installs run, fixture forbidden import/dependency scans run,
current external smoke flows run, and
`current-frontend:platform-smoke` proves the current booking-form consumer path
uses `/api/v1` in platform mode without touching legacy reservation `/api/*`
paths. The backend extraction boundary and dry-run scans prove only that current
candidate source surfaces have not drifted into frontend UI/browser
dependencies and that current manifest move/copy candidates can be enumerated
into a deterministic read-only extraction plan without generated artifacts,
shim copies, excluded paths, target collisions, or frontend targets; and the
`apps/api` proof shows a small backend-owned host surface can exist outside
Next.js for metadata, injected catalog repository reads, injected availability
reads, injected read-only reservation reads, injected idempotent reservation
creation, injected idempotent reservation lifecycle mutations, injected
resource-maintenance list plus idempotent resource-maintenance create/end
routes, disabled chat routes, and backend-only Supabase runtime dependency
construction from explicit/env config, plus optional backend-only service-token
auth, provider-neutral JWT/JWKS bearer verification, bounded JWKS
cache/unknown-`kid` refresh behavior, decoded-claim mapping, and
tenant/venue context validation readiness for protected data routes.
These checks do not prove strict live seeded backend parity, complete database
migration application, RLS/tenant isolation, durable database-backed
idempotency behavior against a real database, live provider configuration,
provider operational key rotation, live enabled-chat provider/backend parity,
private/public registry verification, deploy proof, or actual separate
repository extraction.
The database SQL ownership and migration bundle checks prove inventory
coverage/classification for the current SQL source files plus package-owned
migration file coverage under `packages/database`. The bundle verifier now also
checks the generated migration index for exact core order, separate optional AI
and development seed classification, sha256 checksum drift, byte-size drift,
and path drift. It guards the concrete extensions, tenant/auth, catalog,
resource, booking, resource-maintenance, availability-rule, atomic reservation
RPC, RLS, core security hardening, and durable idempotency migration assets
against placeholder-only regressions, but it still does not prove migration
execution, RLS behavior, tenant isolation, live atomic reservation behavior,
durable idempotency behavior against a database, or standalone database runtime
readiness. The database live-proof harness makes that future runtime check
executable from CI or a backend-only workspace by applying the package-owned
migration-index plan through `psql` when `RESERVATION_DATABASE_LIVE_URL` is
provided, and by failing in strict mode when config or `psql` is missing; it
still does not itself assert RLS/tenant behavior after applying SQL.
`current-frontend:admin-platform-smoke` adds the same mocked
current-frontend browser proof for admin list/search/status and
resource-maintenance UI paths through env-gated smoke-only routes, without
weakening normal admin auth. It does not yet prove strict live seeded backend parity,
private/public registry installation, live enabled-chat provider/backend parity, or final backend
extraction readiness.

## Live Backend SDK Parity Readiness

`corepack pnpm run sdk:live-parity` is the CI-safe readiness gate. It validates
the expected live env contract on every run and exits `0` with `SKIPPED` when
the required live backend fixture env is absent or incomplete. If the full env
is present, it performs SDK/direct HTTP parity checks against the same live
`/v1` backend for metadata, configured service, configured resource,
availability, and reservation list/summary responses. Mutation checks run only when
`sdk:live-parity:strict` is running with
`RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS=1`.

`corepack pnpm run sdk:live-parity:strict` is the required strict proof for a
disposable seeded backend. It fails when required config is missing or
malformed, when mutation opt-in is absent, and on any SDK/direct HTTP payload
mismatch. Strict mode creates one reservation through the SDK, replays the same
idempotency key through direct HTTP, compares read responses through both paths,
and then compares reservation list/summary responses for the created reservation
context. It also compares resource-maintenance list responses before mutation,
creates maintenance through the SDK, replays the same create idempotency key
through direct HTTP, fails clearly if the create response omits
`maintenance_id`, ends that maintenance through the SDK, replays the same end
idempotency key through direct HTTP, and compares resource-maintenance list
responses again after the end operation without assuming the ended maintenance
still appears in an active list.

Required live env:

| Env var | Purpose |
| --- | --- |
| `RESERVATION_PLATFORM_LIVE_BASE_URL` | Absolute backend origin that serves `/v1`. |
| `RESERVATION_PLATFORM_LIVE_TENANT_ID` | Tenant context sent as `X-Reservation-Tenant-Id`. |
| `RESERVATION_PLATFORM_LIVE_VENUE_ID` | Optional venue context sent as `X-Reservation-Venue-Id` and availability query context. |
| `RESERVATION_PLATFORM_LIVE_API_KEY` | Bearer credential sent as `Authorization`. |
| `RESERVATION_PLATFORM_LIVE_SERVICE_ID` | Seeded service id used for service and availability reads. |
| `RESERVATION_PLATFORM_LIVE_RESOURCE_ID` | Seeded resource id used for resource and availability reads. |
| `RESERVATION_PLATFORM_LIVE_START_AT` | ISO-compatible availability window start. |
| `RESERVATION_PLATFORM_LIVE_END_AT` | ISO-compatible availability window end. |
| `RESERVATION_PLATFORM_LIVE_QUANTITY` | Optional quantity; defaults to `1`. |
| `RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS=1` | Required for strict mode and any live reservation creation. |
| `RESERVATION_PLATFORM_LIVE_STRICT=1` | Optional strict-mode flag equivalent to `sdk:live-parity:strict`. |

This proof does not seed or clean up the backend by itself. It must run against
a disposable seeded backend slot. It also does not prove live enabled-chat
backend/provider parity.

## Live Database Migration Proof Readiness

`corepack pnpm run database:live-proof` is the CI-safe readiness gate for the
backend-owned database package. It validates the expected disposable database
env contract, selects the package-owned migration plan from
`packages/database/migrations/supabase/migration-index.json`, and exits `0`
with `SKIPPED` without invoking `psql` when env is absent/incomplete or `psql`
is unavailable. It is wired into `sdk:release-gate` because that default skip is
safe for CI runners without a disposable database.

`corepack pnpm run database:live-proof:strict` is the executable strict proof
entrypoint for a disposable database slot. It fails when required config is
missing or malformed, when `psql` is unavailable, or when any package-owned SQL
file fails to apply with `ON_ERROR_STOP=1`. Strict mode is also enabled by
`RESERVATION_DATABASE_LIVE_STRICT=1`.

Required live database env:

| Env var | Purpose |
| --- | --- |
| `RESERVATION_DATABASE_LIVE_URL` | PostgreSQL connection URL for a disposable database. |
| `RESERVATION_DATABASE_LIVE_PSQL` | Optional `psql` executable path/name; defaults to `psql`. |
| `RESERVATION_DATABASE_LIVE_INCLUDE_AI_RETRIEVAL=1` | Optional opt-in to apply package-owned optional AI retrieval migrations after core migrations. |
| `RESERVATION_DATABASE_LIVE_INCLUDE_DEVELOPMENT_SEEDS=1` | Optional opt-in to apply package-owned development seed SQL after migrations. |
| `RESERVATION_DATABASE_LIVE_STRICT=1` | Optional strict-mode flag equivalent to `database:live-proof:strict`. |

This proof harness does not create, seed, or destroy the disposable database. It
also does not issue behavioral RLS, tenant isolation, atomic reservation, or
durable idempotency assertions after migration application; those remain
separate live proof requirements.

Fresh CI/deploy runners must install the Playwright Chromium browser before
this release gate because the current frontend platform smokes drive the app in
headless Chromium. The root helper
`corepack pnpm run current-frontend:platform-smoke:install` owns that bootstrap
step and should run after `pnpm install` and before `sdk:release-gate`.

## Current Frontend Compatibility Route Removal Plan

Remove local route shims only in small PRs after proof passes:

| Route group | Removal condition |
| --- | --- |
| `app/api/services`, `app/api/venues` | Catalog `/v1` endpoints and frontend SDK/direct HTTP calls pass. |
| `app/api/availability` | Availability parity and frontend form flow pass. |
| `app/api/bookings/**` | Create/read/update/reschedule/cancel parity and admin/customer flows pass. |
| `app/api/seat-maintenance` | Resource maintenance parity and admin UI flow pass. |
| `app/api/chat` | Optional chat `/v1/chat/**` proof passes or chat is explicitly disabled. |

## Failure Rule

If any proof fails, update the owning phase or contract. Do not weaken the
gate, skip parity, or publish the SDK as finished.

Runtime code changed before this gate was satisfied, but only behind the
frontend wrapper/platform-mode compatibility path. Route removal and SDK release
claims remain blocked until the proof matrix above is complete. Current route
idempotency wiring can use durable Supabase storage when backend runtime config
is available, and the standalone backend extraction manifest now directly plans
the `packages/database` package alongside its migration-bundle inputs. The
package now includes concrete curated core schema, resource-maintenance,
availability-rule, atomic reservation RPC, RLS, core security hardening, and
platform idempotency migration assets plus a generated migration-index
checksum/apply-plan artifact plus a CI-safe strict/skip live migration harness,
but an actual disposable DB run, tenant/RLS proof, live atomic behavior,
durable idempotency proof, and
standalone backend rollout are still required before removal claims. The dry run now treats legacy SQL only as
reconciliation input to the inventory/bundle manifests while directly planning
the existing `packages/database` package.
