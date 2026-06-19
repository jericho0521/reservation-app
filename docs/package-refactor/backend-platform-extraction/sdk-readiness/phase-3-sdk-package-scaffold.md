# Phase 3: SDK Package Scaffold

## Purpose

Create the installable SDK package shell at
`reservation-platform-backend/packages/sdk`, published as
`@reservation-platform/sdk`.

The scaffold must be consumer-safe before methods are filled in: no React, no
Next.js, no Supabase, no backend domain imports, no storage adapter imports, and
no current app internals. The SDK is an HTTP client over `/v1` plus public
types, error helpers, request helpers, and idempotency option handling.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/sdk-readiness/README.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-0-sdk-boundary-reset.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-1-backend-api-prerequisite.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-2-contract-types-package.md`
- `docs/package-refactor/backend-platform-extraction/contracts/api-resource-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/sdk-method-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/error-conventions.md`
- `docs/package-refactor/backend-platform-extraction/contracts/idempotency-conventions.md`

## Write Scope

Implementation work belongs in:

- `reservation-platform-backend/packages/sdk`
- SDK tests and package-local build/import check scripts
- backend workspace package manager configuration only if needed to register
  `packages/sdk`

For this planning pass, edit only this phase doc if Phase 3 assumptions change.
Do not edit current frontend UI, backend domain packages, storage adapters,
contract source files, or other phase docs unless explicitly assigned.

## Non-Goals

- Do not implement backend `/v1` endpoints in Phase 3.
- Do not implement complete SDK method bodies beyond safe placeholders or thin
  request plumbing needed for scaffold tests.
- Do not add React, Next.js, Supabase, database, domain, AI workflow, payment
  provider, or UI dependencies.
- Do not add SDK behavior that differs from direct HTTP behavior.
- Do not generate idempotency keys silently for mutations.
- Do not bundle current host-app routes, components, or types into the package.

## Target Package

```text
reservation-platform-backend/packages/sdk
```

Published package:

```text
@reservation-platform/sdk
```

Core dependency:

```text
@reservation-platform/contract-types
```

## Package Shape

```text
packages/sdk/
  package.json
  tsconfig.json
  tsup.config.ts or equivalent build config
  src/
    index.ts
    client.ts
    request.ts
    errors.ts
    idempotency.ts
    types.ts
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
  tests/
    client.test.ts
    exports.test.ts
    forbidden-imports.test.ts
    request.test.ts
    errors.test.ts
    idempotency.test.ts
```

Optional module namespaces such as `chat`, `payments`, `reports`, and
`content` should not be added to the core scaffold unless later phases scope
them.

## Package Exports

`package.json` must expose a small public surface:

```json
{
  "name": "@reservation-platform/sdk",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./types": {
      "types": "./dist/types.d.ts",
      "import": "./dist/types.js"
    }
  }
}
```

Required root exports:

- `createReservationPlatformClient`
- `ReservationPlatformClient` type
- `ReservationPlatformClientOptions` type
- `RequestOptions` type
- `PlatformError`
- `isPlatformError`
- `isRetryable`
- selected DTO type re-exports from `@reservation-platform/contract-types`

Do not expose backend application services, route handlers, storage adapters,
domain models, or current app internals.

## Build Targets

- ESM output for modern bundlers and runtimes.
- Type declaration output.
- Browser-safe code that uses global `fetch` or caller-provided `fetch`.
- Node-compatible execution for runtimes with global `fetch`, with a
  caller-provided `fetch` fallback for older runtimes.
- No reliance on Node-only APIs in the root entrypoint.
- No CommonJS-only runtime requirement unless a later packaging decision
  explicitly adds a separate entrypoint.
- Tree-shakeable module structure with no side effects beyond client
  construction.

## Forbidden Dependency And Import Checks

Add automated checks that fail if `packages/sdk` imports or depends on:

- `react`, `react-dom`, `next`, `next/*`, server actions, cookies, or headers
  helpers.
- `@supabase/supabase-js`, Supabase auth helpers, service role clients, SQL
  files, migrations, RPC/table constants, or database row types.
- `@reservation-platform/domain`,
  `@reservation-platform/adapter-supabase`, current
  `packages/reservations-core`, current `packages/reservations-supabase`, or
  repository implementations.
- Current app internals: `app/**`, `components/**`, `lib/**`, `types/**`,
  `data/**`, route handlers, admin/form/chat/dashboard components.
- LangChain, vector-store adapters, AI provider SDKs, payment provider SDKs, or
  notification provider SDKs in the root SDK package.
- Node-only APIs such as `fs`, `path`, `crypto` Node module, `process.env`, or
  `Buffer` in browser-facing code.

Allowed imports:

- `@reservation-platform/contract-types`
- SDK-local modules
- standard `fetch` types and tiny runtime-neutral helpers when justified

## Consumer-Safe Runtime Requirements

- The SDK constructor accepts `baseUrl`, optional `tenantId`, optional
  `venueId`, optional `apiVersion`, optional `getAccessToken`, optional
  `headers`, optional `fetch`, optional `onRequest`, and optional `onResponse`.
- Request hooks must not expose secrets beyond the caller-provided request
  context.
- The SDK must work in any frontend that can call HTTP, including non-Next.js
  apps.
- The SDK must not assume cookies, browser storage, server components, or a
  framework router.
- The SDK must not mutate global fetch, global headers, or shared singleton
  client state.
- Consumer bundlers should be able to install the package without pulling in
  backend or UI dependencies.

## Implementation Steps

1. Scaffold `reservation-platform-backend/packages/sdk` with package metadata,
   TypeScript config, build config, and test config matching backend workspace
   conventions.
2. Add the root public exports listed above.
3. Create client construction types and an internal request helper that can
   build URLs, attach headers, call `fetch`, parse JSON, and pass hooks.
4. Add `PlatformError` and predicates that preserve the API error object
   exactly.
5. Add idempotency option types and header plumbing without silently generating
   keys.
6. Add module files for every core Phase 1 resource, even if method bodies are
   completed in Phase 4.
7. Add forbidden dependency/import tests and package dependency assertions.
8. Add build tests that verify emitted ESM and `.d.ts` files.
9. Add a minimal external-consumer fixture or plan for Phase 7 to install the
   package without Next.js, React, or Supabase.

## Deliverables

- `packages/sdk` scaffold for `@reservation-platform/sdk`.
- Package exports and public type surface.
- Build configuration and generated declaration plan.
- Request, error, idempotency, and client construction skeletons.
- Forbidden dependency/import check plan and tests.
- Consumer-safe runtime checklist.

## Acceptance Criteria

- `@reservation-platform/sdk` builds without React, Next.js, Supabase, backend
  domain packages, storage adapters, current app internals, or Node-only root
  runtime requirements.
- The package exports `createReservationPlatformClient`, error helpers, request
  option types, and selected contract DTO types.
- The scaffold depends on `@reservation-platform/contract-types` for public
  DTOs instead of hand-maintaining duplicate SDK DTOs.
- Forbidden import checks fail on domain, adapter, Supabase, React, Next.js,
  current app, and database imports.
- Consumer code can construct a client with `baseUrl` and optional fetch/auth
  hooks in a non-Next.js environment.
- The scaffold leaves direct HTTP behavior as the source of truth for Phase 4
  methods.

## Downstream Update Notes

- Phase 4 must fill in methods through the scaffold request helper and keep SDK
  behavior equal to direct HTTP behavior.
- Phase 5 must layer auth, tenant, venue, correlation, and idempotency handling
  through the constructor/options already defined here.
- Phase 7 must install this package in an external consumer fixture and prove
  forbidden dependencies are absent.
- Phase 8 must use the package exports and build targets from this phase for
  packaging and release.
- If package name, source path, exports, build target, runtime requirement, or
  forbidden dependency policy changes, update Phase 0, Phase 2, Phase 4, and
  later readiness phases before implementation continues.
