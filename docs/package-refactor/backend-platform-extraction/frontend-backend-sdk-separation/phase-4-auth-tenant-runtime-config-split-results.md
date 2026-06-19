# Phase 4 Auth, Tenant, and Runtime Config Split Results

This document executes Phase 4 as planning work. It separates browser-safe
frontend configuration from backend-only runtime configuration.

## Environment Ownership Table

| Config | Frontend | SDK | Backend platform |
| --- | --- | --- | --- |
| Backend API base URL | May read browser-safe public URL | Required option | Owns deployed URL |
| Tenant ID / venue ID | May select or store browser-safe context | Forwards via headers/options | Validates and enforces |
| User access token | Obtained through frontend auth UX | Read through callback | Validates claims/roles |
| Supabase anon key | Host auth only if current auth provider needs it | Must not require | Not platform integration contract |
| Supabase service role key | Forbidden | Forbidden | Server-only |
| OpenRouter/Gemini/provider keys | Forbidden | Forbidden | Server-only optional modules |
| Idempotency store | Forbidden | Forwards key only | Owns records/replay/misuse |
| Correlation/request IDs | May generate/pass | Forwards | Logs/traces |

## Header And Context Contract

| Context | SDK/frontend responsibility | Backend responsibility |
| --- | --- | --- |
| Authorization | Attach bearer token or configured credential. | Validate identity, role, tenant access. |
| Tenant | Pass configured tenant context when required. | Enforce tenant isolation. |
| Venue | Pass configured venue context when required. | Validate venue belongs to tenant and operation. |
| Idempotency-Key | Provide per mutation intent. | Store, replay, and reject misuse. |
| Correlation ID | Optional per request. | Preserve in logs/errors. |

`@reservation-platform/api` now includes a framework-neutral request context
parser for these headers. It normalizes trimmed header values, extracts Bearer
tokens for downstream auth code, and exposes a non-throwing bearer-token
requirement result using platform error bodies.

`@reservation-platform/api` also now includes a framework-neutral idempotency
decision layer. It defines a storage-agnostic repository port with an atomic
claim-or-return-existing operation, canonical JSON mutation fingerprints,
first-writer proceed tokens, completed-response replay, same-key/different-
request misuse rejection, and matching in-progress conflict semantics without
importing Next.js, Supabase, SDK, React, app modules, or a concrete database
adapter.

`@reservation-platform/api` now also includes framework-neutral authorization
decision helpers for already-verified principals. They can reject missing
principals, missing required tenant context, tenant/venue access mismatches,
and missing roles or scopes without importing Next.js, Supabase, SDK, React, or
app modules. Missing required tenant context returns `validation_failed`/400
because it is malformed request context after token verification, not proof of
an invalid identity.

`@reservation-platform/api` also now includes a framework-neutral repository-
backed tenant/venue context validation helper for already-authorized contexts.
It defines a minimal storage-agnostic repository port with required
`getTenant(id)` and `getVenue(id)` reads, validates inaccessible
tenant and venue records with isolation-safe `forbidden` responses, checks that
venue records belong to the requested tenant, fails closed when a tenant-
scoped venue record does not expose tenant ownership data, and maps unexpected
repository failures to non-leaking internal platform errors. This helper does
not import Next.js, Supabase, SDK, React, app modules, or token verification
code.

These are context parsing, auth decision, and idempotency decision building
blocks. This is not token verification. Backend runtime adapters still need to
verify bearer tokens, map provider claims to platform principals and
roles/scopes, wire the source-proofed tenant/venue repository adapter against a
live database, add correlation-aware logging, and wire
auth/idempotency/context validation decisions into live route handlers.

The current `/api/v1` route utility layer now also includes a backend-runtime
compatibility service-token adapter. It reads `Authorization: Bearer ...`
through the framework-neutral `readPlatformRequestContext` and
`requirePlatformBearerToken` helpers, compares the presented bearer token to
the backend-only `RESERVATION_PLATFORM_SERVICE_API_KEY`, and returns
platform-shaped errors for missing, non-bearer, wrong-token, and missing
backend service-key states. Missing backend service-key configuration fails
closed with a non-leaking `internal_error` response. The helper is exposed as a
route preflight factory so mutation handlers can reject service-token auth
before JSON body parsing and before idempotency claim/mutation execution. This
is a compatibility backend service-token adapter only; it is not user token
verification, provider claim mapping, tenant authorization, or a browser-safe
SDK/frontend secret.

The same `/api/v1` route utility layer now also centralizes the current host
Supabase protected-route preflight for existing protected reservation and
resource-maintenance mutation shims. Those routes still use the host
`requireAuthenticatedSupabase()` cookie/session behavior and map failures to
the same platform-shaped 401 response before JSON body parsing when an
idempotency key is present. The utility layer also has a host-auth
compatibility tenant/venue context validation preflight that reads
`X-Reservation-Tenant-Id` and optional `X-Reservation-Venue-Id`, validates the
records through `validatePlatformTenantVenueContext` and
`createSupabaseTenantVenueRepository(supabaseAdmin())`, and maps repository
failures to non-leaking platform errors. Protected reservation
update/delete/cancel/reschedule and resource-maintenance create/end mutation
shims now run that validation after current host auth and before JSON body
parsing or mutation execution, while preserving missing-idempotency rejection
as the first mutation preflight. Reservation read/list compatibility shims now
also run the same required tenant and optional venue validation after current
host auth and before calling reservation read storage repositories. This does
not wire the service-token adapter into those routes, does not add bearer
user-token verification, and does not complete broad live route-handler tenant
enforcement.

The standalone `apps/api` skeleton now has its own bounded service-token and
context validation slice plus a provider-neutral bearer-token verifier hook.
`StandaloneApiDependencies` accepts backend-only auth config
(`auth.serviceApiKey` or `serviceApiKey`), `auth.verifyBearerToken`, and an
optional `tenantVenueRepository`. When auth is configured, catalog,
availability, reservation, and resource-maintenance data routes require
`Authorization: Bearer ...` and return platform-shaped 401 errors for missing
or non-bearer credentials before repository work. A matching service token
authenticates as the internal `standalone-api-service` principal and remains a
server-to-server compatibility path. If both a service token and verifier are
configured, the exact service token bypasses the verifier; other bearer tokens
are passed to the verifier. Wrong service tokens without a verifier preserve
the existing platform-shaped 403 error.

The verifier receives the raw token, parsed platform request context, and
request, then returns either an `AuthenticatedPlatformPrincipal` or a stable
platform-shaped auth failure. The standalone skeleton imports no provider SDK
and does not prescribe provider claim names. Verifier-provided principals flow
through `authorizePlatformContext` with `auth.requireTenant`,
`auth.requiredRoles`, and `auth.requiredScopes`, then through
`validatePlatformTenantVenueContext` when a repository is supplied. Verifier
rejections preserve their stable platform error shape; verifier throws fail
closed with a non-leaking `internal_error`. The same preflight runs before
route repository work, idempotency claim/storage work, and protected mutation
body validation. Public metadata and disabled chat routes remain unprotected.
This proves standalone backend provider-neutral JWT/JWKS verifier readiness,
bounded JWKS cache/unknown-`kid` refresh behavior, and shared authorization
plumbing; it does not prove live provider configuration, provider operational
key rotation, live DB/RLS isolation, or finish
deployment/separate-repository extraction.

`apps/api` runtime env now also reads
`RESERVATION_PLATFORM_SERVICE_API_KEY` as optional backend-only standalone auth
config and can create the provider-neutral JWT/JWKS verifier from
`RESERVATION_PLATFORM_AUTH_JWKS_URL`,
`RESERVATION_PLATFORM_AUTH_ISSUER`,
`RESERVATION_PLATFORM_AUTH_AUDIENCE`, optional algorithm/clock-tolerance/JWKS
cache TTL env, and optional subject/tenant/venue/role/scope claim-name env.
Partial JWKS auth
config fails closed. Complete standalone Supabase config wires
`createSupabaseTenantVenueRepository(adminClient)` alongside catalog,
availability, reservation, resource-maintenance, and idempotency repositories.
Service-key-only or JWKS-auth-only env enables auth without constructing
Supabase clients; partial Supabase env still fails closed.

The current `/api/v1` reservation and resource-maintenance mutation shims now
use live route-level begin/replay/commit wiring through a small Next.js route
utility. The utility rejects missing `Idempotency-Key` headers before parsing
mutation bodies, parses JSON once, fingerprints it with the framework-neutral
canonical JSON helper, uses the `@reservation-platform/api` begin/replay/reject
decision layer, skips mutation callbacks for replay responses, and commits
successful mutation responses through the repository port. The route utility
now resolves a backend-runtime idempotency repository: when Supabase service-
role runtime config is present it uses `supabaseAdmin()` and
`createSupabaseIdempotencyRepository`; when that config is absent it falls back
to a clearly named in-process local/dev/test compatibility repository. The
fallback is not durable across processes, deployments, or restarts and is not
production-complete idempotency storage.
`@project-play/reservations-supabase` now includes the backend-only
`createSupabaseIdempotencyRepository` adapter plus
`packages/reservations-supabase/sql/platform-idempotency.sql`, a planning
asset for the durable `platform_idempotency_records` table and atomic
claim/store RPCs. Disposable database proof, migration application, tenant/RLS
proof, and standalone backend rollout remain incomplete.

`@project-play/reservations-supabase` now also includes the backend-only
`createSupabaseTenantVenueRepository(client)` adapter for the
`@reservation-platform/api` repository-backed tenant/venue validation helper.
It centralizes the planned tenant table as
`RESERVATION_SUPABASE_TABLES.platformTenants = "tenants"` and reads venues
from `RESERVATION_SUPABASE_TABLES.venues = "venues"` with
`RESERVATION_SUPABASE_SELECTS.venueContext = "id, tenant_id"` so venue
ownership is selected for fail-closed validation. Focused source tests prove
the tenant and venue table/select/filter payloads and unchanged error
surfacing. The adapter is now wired into the current protected mutation
compatibility shims and reservation read/list compatibility shims through the
host-auth context validation preflight only. This does not prove that the
`tenants` table exists in the current live database, does not apply a
migration, does not prove RLS/tenant isolation, and does not complete broad live
route-handler adoption.

## Current Runtime Implementation

`lib/reservation-platform-client.ts` now has a browser-safe platform context
helper for the current frontend compatibility path:

- `NEXT_PUBLIC_RESERVATION_TENANT_ID` maps to `X-Reservation-Tenant-Id`.
- `NEXT_PUBLIC_RESERVATION_VENUE_ID` maps to `X-Reservation-Venue-Id`.
- Platform-mode requests receive a generated `X-Correlation-Id`.
- Platform mutations keep their `Idempotency-Key` headers while adding the
  tenant, venue, and correlation headers.

This remains frontend-side forwarding plus backend-side context parsing,
framework-neutral auth/tenant authorization decisions, repository-backed
tenant/venue validation decisions, and idempotency decision logic only. Backend
token verification, role source mapping, live tenant/venue repository wiring,
route-handler auth/context/replay wiring, and SDK retry/timeout behavior remain
owned by the later
backend-platform and SDK readiness phases.

## Secret Exposure Prevention Status

- `corepack pnpm run current-frontend:verify-platform-secrets` now runs a
  deterministic source-level scan over current browser/platform-facing
  frontend files: `lib/reservation-platform-client.ts`, `components/form`,
  `components/admin`, `app/admin/AdminDashboard.tsx`,
  `app/admin/platform-smoke`, and `app/form-booking/page.tsx`.
- The source scan blocks server-only secret/env markers such as
  `SUPABASE_SERVICE_ROLE_KEY`, provider API keys, platform service API keys,
  private-key markers, webhook secrets, and non-public `process.env` access.
- The source scan also blocks direct references/imports for
  `@/lib/supabase-browser`, `@/lib/supabase-admin`,
  `@/lib/supabase-server`, and `@supabase/supabase-js` in this
  browser/platform surface. `lib/admin-auth-client.ts` is the only current
  app-owned browser auth facade allowed to import the raw Supabase browser
  helper, and it exposes sign-in/sign-out only.
- `corepack pnpm run current-frontend:verify-platform-boundary` now runs beside
  the secret scan for the same migrated frontend surface. It blocks direct
  legacy reservation route usage outside `lib/reservation-platform-client.ts`,
  backend/domain/storage packages, `app/api` route-handler imports,
  server-only Supabase/LangChain modules, SQL references, and non-public env
  access.
- The check is wired into root `sdk:release-gate` before package packing and
  fixture smoke tests so CI catches current frontend source regressions early.
- This guard is limited to source-level migrated-surface hygiene. It is not
  live seeded backend parity, not backend secret enforcement, not a full bundle
  scan, and not removal of local compatibility routes.
- Add bundle/manifest scan for server-only modules in frontend and SDK output.
- Keep `lib/supabase-admin.ts` behind backend runtime only until moved.
- Prohibit SDK package from reading environment variables directly for secrets.
- Document browser-safe config separately from backend runtime config.

This is not backend secret enforcement, live backend parity, or a complete
frontend bundle scan.

## Server-Only Module Relocation Plan

| Current module | Target |
| --- | --- |
| `lib/supabase-admin.ts` | Backend runtime config/client factory. |
| `lib/supabase-server.ts` | Host auth adapter for current frontend, not SDK/platform public contract. |
| `app/api/api-utils.ts` | Split platform auth/error concepts from Next.js route glue. |
| `lib/langchain/models.ts` | Backend optional AI provider adapter. |
| `lib/langchain/vector-store.ts` | Backend retrieval adapter. |

## Auth And Idempotency Parity Tests

- Missing auth returns same error through SDK and direct HTTP.
- Wrong tenant returns same error through SDK and direct HTTP.
- Missing required idempotency key returns API `missing_idempotency_key` by
  default.
- Same key/body replays consistently.
- Same key/different body returns misuse error.
- Frontend bundle contains no server-only key references.

## Downstream Updates Required

Phase 5 must use backend-only provider keys for chat. Phase 6 must keep bundle
and manifest scans in release gates and should keep current-frontend
platform-mode tests aligned with the wrapper context forwarding described
above. SDK readiness Phase 5 must remain aligned with the default behavior: SDK
forwards context and backend owns decisions.

Runtime code now covers the current frontend compatibility wrapper, a
framework-neutral backend context parser, framework-neutral auth/tenant
decision helpers, a framework-neutral repository-backed tenant/venue
validation helper, a source-proofed Supabase tenant/venue repository adapter,
and a framework-neutral idempotency decision layer. Current reservation and
resource-maintenance `/api/v1` compatibility mutation shims also use
route-handler replay wiring backed by a runtime resolver that selects the
Supabase durable idempotency repository when backend service-role config is
available and otherwise uses the in-process local/dev/test compatibility
fallback. The `/api/v1` route utility layer also has a service-token preflight
adapter for `RESERVATION_PLATFORM_SERVICE_API_KEY` that can run before
body-parsing mutation work, and a centralized host Supabase auth preflight for
the existing protected mutation shims. Current protected reservation and
resource-maintenance mutation shims additionally validate required tenant
context and optional venue ownership through the Supabase tenant/venue
repository after host auth, and reservation read/list compatibility shims now
perform the same validation before reservation read storage work; this is
current-host compatibility context validation, not platform bearer user-token
verification. `apps/api` separately proves optional standalone service-token
enforcement, provider-neutral JWT/JWKS bearer verification, bounded JWKS
cache/unknown-`kid` refresh behavior, configurable provider claim-to-principal
mapping, and tenant/venue validation readiness for catalog, availability,
reservation, and resource-maintenance data routes. This does not complete live
provider configuration, provider operational key rotation, disposable database proof, migration application,
tenant/RLS proof, standalone backend deployment, separate repository
extraction, or make the SDK release-ready.
