# Standalone API Skeleton

This private workspace app is a bounded proof that the reservation platform
packages can be hosted outside the current Next.js frontend.

It is intentionally small:

- imports backend-owned packages such as `@reservation-platform/api` and
  `@reservation-platform/contract-types`;
- exposes framework-neutral route handlers for `GET /healthz` and
  `GET /v1/health` liveness/readiness hygiene, `GET /v1/metadata`, injected
  catalog repository reads, injected availability reads, injected read-only
  reservation reads, injected idempotent `POST /v1/reservations` creation,
  injected idempotent reservation lifecycle mutations (`PATCH
  /v1/reservations/{reservation_id}`, `POST
  /v1/reservations/{reservation_id}/reschedule`, and `POST
  /v1/reservations/{reservation_id}/cancel`), injected resource-maintenance
  list/create/end routes (`GET /v1/resource-maintenance`, `POST
  /v1/resource-maintenance`, and `POST
  /v1/resource-maintenance/{maintenance_id}/end`),
  and disabled chat reservation routes;
- includes an optional Node HTTP server entry for local smoke checks;
- includes a backend-only Supabase runtime dependency factory for deployable
  standalone hosts;
- can optionally protect catalog, availability, reservation, and
  resource-maintenance data routes with a backend-only service bearer token or
  an injected bearer-token verifier plus tenant/venue context validation,
  while keeping health, metadata, and disabled chat responses unprotected;
- avoids `app/`, `components/`, React, Next.js, browser Supabase helpers,
  LangChain, and provider SDK imports.

The health endpoints are intentionally cheap public checks. `GET /healthz` and
`GET /v1/health` return the same stable JSON body with only public status and
API/service metadata. They do not require auth, tenant headers, Supabase env,
repository dependencies, idempotency storage, or request-body parsing, and they
do not echo runtime secrets or environment values.

The default handler is deliberately safe: catalog, availability, and
reservation routes return stable platform errors until a host supplies
`PlatformCatalogRepository`, `AvailabilityRepositoryPort`,
`ReservationReadRepositoryPort`, `ReservationCreateRepositoryPort`,
`ReservationMutationRepositoryPort`, `ResourceMaintenanceRepositoryPort`, and
`IdempotencyRepository` implementations through
`createStandaloneApiHandler({ catalogRepository, availabilityRepository, reservationReadRepository, reservationCreateRepository, reservationMutationRepository, resourceMaintenanceRepository, idempotencyRepository })`.
Tests prove route mapping, create and lifecycle validation, resource-maintenance
delegation, idempotency replay/misuse for reservation and resource-maintenance
mutations, and response mapping with fake repositories only. Durable
database-backed idempotency remains a rollout proof for the final host.

Hosts may pass `auth: { serviceApiKey }`, top-level `serviceApiKey`, or
`auth.verifyBearerToken` to `createStandaloneApiHandler()` to require
`Authorization: Bearer ...` on catalog, availability, reservation, and
resource-maintenance data routes. Missing or non-bearer credentials return
platform-shaped `unauthorized` errors. Wrong service tokens without a verifier
preserve the compatibility `forbidden` error.

`auth.verifyBearerToken` is a provider-neutral injection point.
`src/jwt-verifier.ts` also provides
`createStandaloneJwtJwksBearerTokenVerifier()` for backend-only JWT/JWKS
verification without provider SDKs. It validates compact RS256 JWTs against
configured issuer, audience, JWKS URL, allowed algorithms, `exp`, `nbf`, and
`iat`, rejects malformed tokens, missing/unknown `kid`, bad signatures, and
missing principal claims with stable `Invalid bearer token.` platform errors,
and maps verified claims through `principalFromTokenClaims()` from
`@reservation-platform/api`. Claim names for subject, tenant, venue, role, and
scope are configurable. JWKS responses are cached per verifier instance for a
configurable TTL, and an unknown `kid` refreshes JWKS once before verification
fails closed. If verification throws, the handler fails closed with a
non-leaking `internal_error`. If both a service key and verifier are configured,
the exact service token authenticates as the internal `standalone-api-service`
principal without calling the verifier; all other bearer tokens are sent to the
verifier.

The authenticated principal, whether service or verifier-provided, is passed to
`authorizePlatformContext` with `auth.requireTenant`, `auth.requiredRoles`, and
`auth.requiredScopes`. When a `tenantVenueRepository` is supplied, the
authorized tenant and optional venue context are validated before route
repositories run. The auth preflight runs before idempotency claim/storage work
and mutation body validation. `GET /healthz`, `GET /v1/health`,
`GET /v1/metadata`, and disabled chat routes remain unprotected.

`createStandaloneSupabaseDependencies(config, options?)` in `src/runtime.ts`
can build those dependencies from backend-owned Supabase clients. Public catalog
and service reads use `RESERVATION_SUPABASE_ANON_KEY`; backend writes,
reservation reads/mutations, resource maintenance, admin availability reads,
idempotency, and tenant/venue context validation use
`RESERVATION_SUPABASE_SERVICE_ROLE_KEY`. `RESERVATION_PLATFORM_SERVICE_API_KEY`
optionally enables the backend service-token gate. The direct Node server calls
`createStandaloneSupabaseDependenciesFromEnv()` at startup: when all Supabase
runtime env values are absent it keeps the safe default repository-not-
configured behavior, when only the platform service key is present it enables
auth without constructing Supabase clients, and when any Supabase value is
present the Supabase config must be complete or startup fails closed. JWT/JWKS
auth can also be enabled with the backend-only `RESERVATION_PLATFORM_AUTH_*`
env values below, either with or without Supabase runtime config. Partial JWKS
auth config fails closed at startup.

Backend-only runtime env:

| Env var | Purpose |
| --- | --- |
| `RESERVATION_SUPABASE_URL` | Supabase project URL for the standalone backend. |
| `RESERVATION_SUPABASE_ANON_KEY` | Public/anon key used only by the backend server for public catalog/service reads. |
| `RESERVATION_SUPABASE_SERVICE_ROLE_KEY` | Service-role key used only by the backend server for admin reads, writes, and idempotency. |
| `RESERVATION_PLATFORM_SERVICE_API_KEY` | Optional backend-only bearer credential for standalone service-token route protection. |
| `RESERVATION_PLATFORM_AUTH_JWKS_URL` | Optional JWKS URL for standalone user bearer-token verification. |
| `RESERVATION_PLATFORM_AUTH_ISSUER` | Required issuer when JWKS auth is enabled. |
| `RESERVATION_PLATFORM_AUTH_AUDIENCE` | Required comma-separated audience list when JWKS auth is enabled. |
| `RESERVATION_PLATFORM_AUTH_ALGORITHMS` | Optional comma-separated allowed algorithms; defaults to `RS256`. |
| `RESERVATION_PLATFORM_AUTH_CLOCK_TOLERANCE_SECONDS` | Optional clock tolerance for registered time claims. |
| `RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS` | Optional in-memory JWKS cache TTL; defaults conservatively and invalid values fail closed. |
| `RESERVATION_PLATFORM_AUTH_SUBJECT_CLAIM` | Optional subject claim name override. |
| `RESERVATION_PLATFORM_AUTH_TENANT_IDS_CLAIM` | Optional tenant-id claim name override. |
| `RESERVATION_PLATFORM_AUTH_VENUE_IDS_CLAIM` | Optional venue-id claim name override. |
| `RESERVATION_PLATFORM_AUTH_ROLES_CLAIM` | Optional role claim name override. |
| `RESERVATION_PLATFORM_AUTH_SCOPES_CLAIM` | Optional scope claim name override. |

These are standalone backend secrets/config values. They are not frontend SDK
configuration and must not be exposed through `NEXT_PUBLIC_*` or browser
bundles.

The standalone deployment config contract is checked by
`corepack pnpm run backend-platform:verify-standalone-deployment-config`.
The default command is CI-safe: it parses env only, performs no network calls,
does not deploy, and exits successfully with a `SKIPPED` message when the
standalone deployment env is absent. The strict variant,
`corepack pnpm run backend-platform:verify-standalone-deployment-config:strict`,
fails closed when required deployment config is absent or malformed. A strict
standalone deployment config requires complete backend-only Supabase env plus
at least one auth mechanism: `RESERVATION_PLATFORM_SERVICE_API_KEY` or complete
`RESERVATION_PLATFORM_AUTH_JWKS_URL`, `RESERVATION_PLATFORM_AUTH_ISSUER`, and
`RESERVATION_PLATFORM_AUTH_AUDIENCE`. Optional `PORT`, auth numeric settings,
service token, and backend AI/chat provider env are validated when present, and
`NEXT_PUBLIC_*` backend secret-style names are rejected.

The deployable runtime contract is recorded in `apps/api/deployment.config.json`.
The verifier checks that manifest against `apps/api/package.json` and
`apps/api/src/runtime.ts`: the package name must stay aligned, the build command
must build `@reservation-platform/standalone-api-skeleton`, the start command
must run `node apps/api/dist/server.js`, health must stay on `/v1/health`,
Supabase env must stay backend-only, and the auth alternatives must remain
service-token or JWT/JWKS based.

Browser frontends should be enabled through
`RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS`, a comma-separated list of exact
allowed origins such as `https://frontend.example.com`. The standalone API
handles `OPTIONS` preflight requests itself and reflects CORS headers only for
configured origins.

It is not live backend parity. The health endpoints are deployability/readiness
hygiene only: they prove that a deployed host process can answer a cheap public
request, not that the service has been deployed, connected to Supabase, applied
database migrations, enforced RLS/tenant isolation, or reached live reservation
parity. It now has backend-only Supabase repository
wiring plus service-token/context validation, provider-neutral standalone
JWT/JWKS bearer-token verification, bounded JWKS cache/unknown-`kid` refresh
behavior, and claim-to-principal mapping, but it does not prove live provider
configuration, provider operational key rotation, live database migrations,
durable database-backed idempotency, RLS/tenant isolation, seeded data parity,
provider-backed chat, a live deployment, or a separate repository extraction.

## Commands

Run from the repository root:

```powershell
corepack pnpm run backend-platform:verify-standalone-api-skeleton
```

This is safe to run in the current repo. It builds the platform package types
needed by the skeleton, type-checks this app, runs its route tests, and checks
the source-boundary assertions.

```powershell
corepack pnpm run backend-platform:verify-standalone-deployment-config
```

This is also safe to run in the current repo. It validates the standalone
backend deployment/runtime env contract only. It performs no network calls,
does not deploy, and skips when unconfigured. Use
`corepack pnpm run backend-platform:verify-standalone-deployment-config:strict`
only in environments where the required standalone backend deployment env is
expected to be present; it intentionally fails when that config is missing or
malformed.

To start the optional local Node server after the package has been built:

```powershell
corepack pnpm --filter @reservation-platform/standalone-api-skeleton run build
node apps/api/dist/server.js
```

The server listens on `PORT` or `4100`.
