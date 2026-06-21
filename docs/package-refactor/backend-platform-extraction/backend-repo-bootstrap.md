# Backend Repository Bootstrap Guide

This guide describes how the planned `reservation-platform-backend` repository
should be bootstrapped from the current extraction-readiness artifacts. It is a
Phase 11 readiness guide, not evidence that a separate repository already
exists.

## Source Inputs

Use these current-repository inputs:

- `docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json`
- `scripts/verify-standalone-backend-extraction-manifest.mjs`
- `scripts/verify-standalone-backend-extraction-dry-run.mjs`
- `apps/api`
- backend-owned package candidates listed in
  `docs/package-refactor/backend-platform-extraction/backend-package-ownership.md`
- backend contract docs under
  `docs/package-refactor/backend-platform-extraction/contracts`

Treat current `app/api/**` route files as reference-only compatibility context.
They can inform behavior, but they are not canonical backend source for the new
repository.

## Install

The extracted backend repository should keep a pnpm workspace and install from
its own lockfile:

```powershell
corepack enable
corepack pnpm install --frozen-lockfile
```

Safe to run after the backend repository has its own `pnpm-lock.yaml`. In the
current combined repository, use the existing root lockfile instead of creating
a new backend-only lockfile in place.

## Build And Test

Minimum local checks for the backend repository should cover package builds,
standalone API behavior, database bundle checks, and extraction guardrails:

```powershell
corepack pnpm run packages:build
corepack pnpm run packages:test
corepack pnpm run backend-platform:verify-standalone-api-skeleton
corepack pnpm run database:verify-migration-bundle
corepack pnpm run backend-platform:verify-extraction-manifest
corepack pnpm run backend-platform:verify-extraction-dry-run
corepack pnpm run backend-platform:verify-package-graph-boundary
```

These commands are safe in the current repository. They are local build, test,
type-check, manifest, dry-run, and package-graph checks. The package-graph
boundary command reads backend-owned package/app `package.json` files only. It
does not create a new repository, copy files, publish packages, deploy a
service, install dependencies, or run live network/database proofs.

The standalone deployment config parser can be checked without live services:

```powershell
corepack pnpm run backend-platform:verify-standalone-deployment-config
```

This is safe locally. It parses environment variables only and skips when the
standalone deployment environment is absent. Use the strict variant only in an
environment where required standalone backend deployment values are expected:

```powershell
corepack pnpm run backend-platform:verify-standalone-deployment-config:strict
```

The strict command is safe, but intentionally fails when required backend
deployment configuration is missing or malformed.

## Runtime Environment

The backend service owns server-side runtime configuration. These values must
stay out of frontend bundles and must not use `NEXT_PUBLIC_*` names:

| Env var | Purpose |
| --- | --- |
| `PORT` | Optional Node server port; defaults to the app runtime default. |
| `RESERVATION_SUPABASE_URL` | Supabase project URL for the standalone backend. |
| `RESERVATION_SUPABASE_ANON_KEY` | Backend-held anon key for public catalog/service reads. |
| `RESERVATION_SUPABASE_SERVICE_ROLE_KEY` | Backend-held service-role key for writes, admin reads, idempotency, and tenant/venue checks. |
| `RESERVATION_PLATFORM_SERVICE_API_KEY` | Optional backend-only bearer token for service-to-service route protection. |
| `RESERVATION_PLATFORM_AUTH_JWKS_URL` | Optional JWKS URL for provider-neutral user bearer verification. |
| `RESERVATION_PLATFORM_AUTH_ISSUER` | Required issuer when JWKS auth is enabled. |
| `RESERVATION_PLATFORM_AUTH_AUDIENCE` | Required comma-separated audience list when JWKS auth is enabled. |
| `RESERVATION_PLATFORM_AUTH_ALGORITHMS` | Optional allowed JWT algorithms; defaults to `RS256`. |
| `RESERVATION_PLATFORM_AUTH_CLOCK_TOLERANCE_SECONDS` | Optional clock tolerance for JWT time claims. |
| `RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS` | Optional JWKS cache TTL. |
| `RESERVATION_PLATFORM_AUTH_SUBJECT_CLAIM` | Optional subject claim override. |
| `RESERVATION_PLATFORM_AUTH_TENANT_IDS_CLAIM` | Optional tenant claim override. |
| `RESERVATION_PLATFORM_AUTH_VENUE_IDS_CLAIM` | Optional venue claim override. |
| `RESERVATION_PLATFORM_AUTH_ROLES_CLAIM` | Optional roles claim override. |
| `RESERVATION_PLATFORM_AUTH_SCOPES_CLAIM` | Optional scopes claim override. |

Optional AI/chat provider configuration belongs to the backend repository only
when the optional chat module is enabled. Provider keys must not be exposed to
the SDK or consumer frontends.

## Database Proof

The backend repository owns the database migration bundle through
`@reservation-platform/database`.

Run the read-only local bundle check first:

```powershell
corepack pnpm run database:verify-migration-bundle
```

`database:verify-migration-bundle` is safe to run in the current repository. It
checks the package-owned migration index and bundle shape without connecting to
a database or applying SQL.

Run database live proof only against disposable infrastructure:

```powershell
corepack pnpm run database:live-proof
corepack pnpm run database:live-proof:strict
```

`database:live-proof` skips when `RESERVATION_DATABASE_LIVE_URL` or `psql` is
not configured. When they are configured, even without `--strict`, it connects
to the target PostgreSQL database and applies the package migration plan through
`psql`. The strict variant is the required CI/live-proof form, but both
non-strict and strict live-proof commands can mutate the configured target.
They must not point at shared production data.

## Live Proof

The backend repository is not live-proven until the strict live-readiness and
parity checks pass against disposable infrastructure:

```powershell
corepack pnpm run backend-platform:live-proof-readiness
corepack pnpm run backend-platform:live-proof-readiness:strict
corepack pnpm run sdk:live-parity:strict
corepack pnpm run sdk:registry-install-proof:strict
```

The non-strict readiness command is safe locally and performs configuration
readiness checks without network, database, registry, install, publish, or live
mutation calls. The strict commands should run only in an environment configured
for disposable live proof. They intentionally fail closed when required values
are missing.

## SDK Consumer Integration

Consumer frontends should integrate through the deployed `/v1` API and the
HTTP-only SDK. They should not import backend packages, database packages,
storage adapters, route handlers, or migration helpers.

Expected consumer configuration:

- a backend API base URL, such as `https://api.example.com/v1`
- tenant and optional venue identifiers
- user/session bearer token strategy, or service-token strategy for
  server-to-server consumers only
- idempotency keys for mutating requests
- optional correlation/request identifiers

The SDK package can remain in the backend repository release model, but it must
stay consumer-safe: no React, Next.js, Supabase service clients, LangChain,
provider SDKs, database migrations, route handlers, or backend repository
interfaces.

## Must Not Be Included

The backend repository must not include these current-frontend concerns as
backend source:

- `app/page.tsx`, `app/form-booking`, `app/chat-booking`
- `app/admin`
- `app/blog`, `app/updates`
- frontend analytics/reporting UI and current analytics API routes
- `components/**`, including form, chat, admin, shared, landing, analytics,
  and UI primitives
- current frontend auth/client helpers under `lib/supabase*`
- `lib/reservation-platform-client.ts`
- current-app compatibility `app/api/**` route files as canonical backend code
- generated or install artifacts, including `.next`, `.turbo`, `node_modules`,
  `dist-packages`, `coverage`, `out`, source maps, and `*.tsbuildinfo`

The extraction manifest and dry-run verifier are the current guardrails for
these exclusions:

```powershell
corepack pnpm run backend-platform:verify-extraction-manifest
corepack pnpm run backend-platform:verify-extraction-dry-run
corepack pnpm run backend-platform:verify-package-graph-boundary
```

These commands are safe to run locally. They are read-only checks over the
manifest, current file tree, and backend package manifests.
