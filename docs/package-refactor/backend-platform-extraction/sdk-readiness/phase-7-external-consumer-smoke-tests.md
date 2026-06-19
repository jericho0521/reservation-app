# Phase 7: External Consumer Smoke Tests

## Purpose

Prove `@reservation-platform/sdk` works outside this repository, outside the
current Next.js app, and in the same way as direct HTTP.

The SDK is not ready until clean external consumers can install it, call a
deployed or local backend `/v1` API, and complete representative reservation
flows without importing current app internals, backend domain packages,
storage adapters, Supabase clients, React UI, or Next.js-only code.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/sdk-readiness/README.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-0-sdk-boundary-reset.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-1-backend-api-prerequisite.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-2-contract-types-package.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-3-sdk-package-scaffold.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-4-core-sdk-methods.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-5-auth-tenant-idempotency.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-6-optional-chat-sdk.md`
- `docs/package-refactor/backend-platform-extraction/contracts/api-resource-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/sdk-method-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/error-conventions.md`
- `docs/package-refactor/backend-platform-extraction/contracts/idempotency-conventions.md`

## Write Scope

Implementation work belongs in backend-platform-owned SDK smoke fixtures,
defaulting to paths such as:

- `reservation-platform-backend/examples/plain-typescript`
- `reservation-platform-backend/examples/vite-react`
- `reservation-platform-backend/examples/next-external`
- `reservation-platform-backend/examples/server-to-server`
- `reservation-platform-backend/examples/direct-http`
- `reservation-platform-backend/examples/chat-consumer` if chat is enabled
- SDK CI scripts and fixture import checks

For this planning pass, edit only this phase doc if Phase 7 assumptions change.
Do not edit current frontend UI, current `app/api/**` routes, backend domain
packages, storage adapters, SDK release files, or other phase docs unless
explicitly assigned.

## Non-Goals

- Do not use this repository's current Next.js app as the only SDK proof.
- Do not import current app internals, route handlers, components, `lib/**`,
  `types/**`, Supabase helpers, backend domain packages, storage adapters, or
  database code into external fixtures.
- Do not mock away the SDK request layer in the only smoke tests. Unit tests
  may mock fetch, but smoke tests must exercise real package installation and
  HTTP request construction.
- Do not require every external fixture to implement production UI polish.
- Do not publish the SDK before these smoke tests pass.
- Do not let optional chat block core SDK release when chat is not enabled.
- Do not change canonical DTO/method rules:
  `ReservationResponse` is canonical, `rescheduleReservation` owns movement
  changes, `updateReservation` owns non-slot patches, and SDK equals direct
  HTTP.

## Required External Fixtures

| Fixture | Purpose | Required proof |
| --- | --- | --- |
| Plain TypeScript | Framework-free Node or runtime-neutral script | Imports `@reservation-platform/sdk` and selected `@reservation-platform/contract-types`, calls metadata, availability, create/read/replay flows. |
| Vite/React | Browser bundler proof | Builds a small React form/page that calls SDK with browser-safe token callback and no server secrets. |
| Separate Next.js | Proves SDK is not coupled to this app | New minimal Next.js app outside current repo app tree, imports SDK from npm-style package install, no `next/*` imports inside SDK bundle. |
| Server-to-server | Backend integration proof | Uses caller-provided server credential or bearer token only on the server, calls admin/list flows and mutations with idempotency. |
| Direct HTTP | SDK parity proof | Calls the same `/v1` flows with raw `fetch` and compares payloads/errors to SDK calls. |
| Optional chat | Chat proof when enabled | Calls JSON chat, streaming chat, disabled-module behavior, and confirm flow through SDK and direct HTTP. |

## Pack And Install Modes

Smoke tests should run across at least two install modes before release:

| Mode | Command shape | Purpose |
| --- | --- | --- |
| Workspace link | package-manager workspace dependency | Fast local development against `reservation-platform-backend/packages/sdk`. |
| Local tarball | `npm pack` or package-manager equivalent | Proves published file list, `exports`, declarations, and dependency metadata. |
| Private registry | internal registry install | Required before private/internal release. |
| Public registry | npm install by version | Required before public release or post-publish verification. |

The local tarball mode is mandatory for release readiness because it catches
missing files, broken `exports`, missing `.d.ts`, and accidental workspace-only
imports.

## Smoke Flow Matrix

The flow inventory is shared by all fixtures:

| Flow | SDK call | Direct HTTP parity | Notes |
| --- | --- | --- | --- |
| Metadata | `getMetadata()` | `GET /v1/metadata` | Confirms API version and enabled modules. |
| Tenant context | `getCurrentTenant()` | `GET /v1/tenants/current` | Confirms auth/tenant headers. |
| Catalog | `listVenues`, `listServices`, `listResources` | matching `GET` endpoints | Confirms query/header behavior. |
| Availability | `listAvailability(input)` | `GET /v1/availability` | Confirms query serialization and `AvailabilityResponse`. |
| Create reservation | `createReservation(input, { idempotencyKey })` | `POST /v1/reservations` | Returns canonical `ReservationResponse`. |
| Replay create | same create call and same key | same direct HTTP replay | Confirms idempotency metadata or identical replay behavior. |
| Key misuse | same key with different body | same direct HTTP misuse | Preserves `idempotency_key_reused_with_different_request`. |
| Read reservation | `getReservation(reservationId)` | `GET /v1/reservations/{reservation_id}` | Confirms path param handling. |
| Non-slot patch | `updateReservation(id, patch, options)` | `PATCH /v1/reservations/{reservation_id}` | Patch must not contain movement fields. |
| Reschedule | `rescheduleReservation(id, input, options)` | `POST /v1/reservations/{reservation_id}/reschedule` | Owns slot/date/time/quantity/resource assignment changes. |
| Cancel | `cancelReservation(id, input, options)` | cancel endpoint | Confirms lifecycle mutation idempotency. |
| Error preservation | representative invalid request/conflict | same raw fetch error | Confirms `PlatformError` preserves API body. |

Fixtures may use a seeded backend, ephemeral test tenant, or test doubles only
when direct HTTP and SDK both call the same HTTP surface.

## Minimum Fixture Coverage

Release gating must not accept a fixture that only proves installation. Each
fixture owns a minimum proof set:

| Fixture | Required install mode | Minimum flows |
| --- | --- | --- |
| Plain TypeScript | Local tarball | Metadata, availability, create reservation, replay create, key misuse, read reservation, error preservation, direct HTTP parity assertions, and fixture-owned manifest/import/secret scans. |
| Vite/React browser | Local tarball | Metadata, catalog, availability, create/read reservation through browser-safe auth, forbidden server-secret checks, no Node-only API usage, and bundled output scan for Supabase/Next/current app imports. |
| Separate Next.js | Local tarball | Metadata, availability, create/read reservation from a separate app tree, no imports from this repository's `app/**`, `components/**`, `lib/**`, or route handlers, direct HTTP parity for one read and one mutation, and manifest/build-output scans. |
| Server-to-server | Local tarball | Tenant context, availability, create/replay/key-misuse flows with server credential isolation, timeout/abort behavior, safe read retry behavior, and fixture-owned manifest/import/secret scans. |
| Direct HTTP reference | No SDK install required; may install `@reservation-platform/contract-types` | Raw fetch coverage for every flow used by SDK fixtures, with matching payload/error snapshots. |
| Optional chat | Local tarball when chat is enabled | Disabled-module behavior when off; when on, JSON message, stream message via `messages:stream`, confirm reservation, idempotency, provider-secret boundary, and direct HTTP parity. |

Additional fixture flows are welcome, but these minimums are release gates.

## Forbidden Import Checks

External fixtures and SDK package checks must fail if they import or depend on:

- current app internals: `app/**`, `components/**`, `lib/**`, `types/**`,
  `data/**`, route handlers, admin/form/chat/dashboard UI
- legacy/current reservation internals:
  `packages/reservations-core`, `packages/reservations-supabase`,
  backend repositories, domain packages, storage adapters
- Supabase browser/server clients, service-role clients, raw table names, RPC
  names, SQL files, migrations, or database row types
- React, React DOM, Next.js, `next/*`, cookies/headers helpers, or server
  actions inside the SDK package itself
- LangChain, AI provider SDKs, retrieval/vector-store adapters, backend chat
  internals, or current chat UI inside the SDK package
- Node-only APIs in browser fixtures or browser-facing SDK entrypoints

Allowed external fixture imports:

- `@reservation-platform/sdk`
- `@reservation-platform/contract-types`
- framework/runtime dependencies owned by that fixture
- fixture-local code

Use static checks with `rg`, dependency graph tooling, package manifest checks,
or bundler analysis. The checks must inspect packed tarball contents as well as
workspace source.

## Proof Configuration

Each fixture should document:

- `RESERVATION_PLATFORM_BASE_URL`
- tenant and venue configuration used for tests
- how `getAccessToken` obtains a test token or server credential
- whether credentials are browser-safe or server-only
- idempotency key generation strategy for test intents
- backend seed data required for services, resources, availability, and
  reservations
- expected cleanup strategy for created reservations
- whether optional chat is enabled or expected to return
  `chat_module_disabled`

## Implementation Steps

1. Create clean external fixture directories outside the current app tree.
2. Add workspace-link installation for fast local SDK iteration.
3. Add local tarball installation using the packed
   `@reservation-platform/sdk` package and its
   `@reservation-platform/contract-types` dependency.
4. Add plain TypeScript smoke flow covering metadata, availability,
   reservation create/read/replay, and error preservation.
5. Add Vite/React browser build and smoke flow with browser-safe auth only.
6. Add separate Next.js fixture proof that imports the SDK as an external
   package and does not rely on this app's `app/**` files.
7. Add server-to-server fixture proof with server-only credentials kept out of
   browser bundles.
8. Add direct HTTP fixture that compares SDK success payloads and error bodies
   with raw `fetch`.
9. Add optional chat fixture for JSON, streaming, disabled-module, idempotency,
   and confirmation flows when chat is enabled.
10. Add forbidden import checks for fixture source, SDK source, dependency
    manifests, and packed tarball contents.
11. Run the smoke suite in CI against a seeded local backend or stable test
    backend.
12. Record a gap log for any endpoint, DTO, auth, idempotency, packaging, or
    documentation issue that blocks external use.

## Current Branch Progress

The branch now includes the first SDK-specific external fixtures:

- `examples/sdk-plain-typescript-smoke` installs
  `@reservation-platform/sdk` and `@reservation-platform/contract-types` from
  local tarballs under `dist-packages/`.
- `examples/sdk-server-to-server-smoke` installs the same tarballs and models a
  server integration with caller-owned server credentials.
- `examples/sdk-vite-react-smoke` installs the same SDK and contract tarballs
  into a clean Vite/React package and builds a browser bundle against a
  fixture-local in-memory `/v1` fetch surface.
- `examples/sdk-next-external-smoke` installs the same SDK and contract
  tarballs into a separate minimal Next.js app tree, builds outside the
  repository's current app, and runs metadata, catalog, availability,
  create/read reservation, and direct raw-fetch replay/read parity against the
  same fixture-local in-memory `/v1` fetch surface.
- `examples/sdk-chat-disabled-smoke` installs the same SDK and contract
  tarballs into an isolated non-workspace package and runs metadata,
  availability, and disabled-chat checks against a fixture-local fake `/v1`
  surface where chat is absent from metadata.
- `examples/sdk-chat-enabled-smoke` installs the same SDK and contract
  tarballs into an isolated non-workspace package and runs enabled-chat
  metadata, session, message, stream, and confirmation checks against a
  fixture-local fake `/v1/chat` surface.
- `packages/contract-types/contracts/openapi.json` and
  `packages/contract-types/contracts/json-schema/*.schema.json` are generated
  from the package-local public contract registry and checked with
  `corepack pnpm --filter @reservation-platform/contract-types run contracts:check`.
- Root scripts:
  - `corepack pnpm --filter @reservation-platform/contract-types run contracts:generate`
  - `corepack pnpm --filter @reservation-platform/contract-types run contracts:check`
  - `corepack pnpm run sdk:fixtures:sync-tarballs`
  - `corepack pnpm run sdk:fixtures:check-tarballs`
  - `corepack pnpm run sdk:smoke:plain:install`
  - `corepack pnpm run sdk:smoke:plain`
  - `corepack pnpm run sdk:smoke:server:install`
  - `corepack pnpm run sdk:smoke:server`
  - `corepack pnpm run sdk:smoke:vite:install`
  - `corepack pnpm run sdk:smoke:vite`
  - `corepack pnpm run sdk:smoke:next:install`
  - `corepack pnpm run sdk:smoke:next`
  - `corepack pnpm run sdk:smoke:chat-disabled:install`
  - `corepack pnpm run sdk:smoke:chat-disabled`
  - `corepack pnpm run sdk:smoke:chat-enabled:install`
  - `corepack pnpm run sdk:smoke:chat-enabled`
  - `corepack pnpm run sdk:smoke:install`
  - `corepack pnpm run sdk:smoke`
  - `corepack pnpm run current-frontend:platform-smoke`
  - `corepack pnpm run current-frontend:admin-platform-smoke`
  - `corepack pnpm run sdk:release-gate`
- The aggregate `sdk:release-gate` checks OpenAPI/JSON Schema artifact drift,
  packs local tarballs, verifies exact-version packed SDK and contract package
  boundaries including committed contract artifacts, checks that external
  fixture manifests and lockfiles point at the current SDK and contract
  tarball versions, installs every external fixture from those tarballs, and
  runs the safe `sdk:registry-install-proof` readiness check, the fixture smoke
  suite, and the current frontend platform-mode browser smokes.
- `current-frontend:platform-smoke` starts the current Next.js app with
  `NEXT_PUBLIC_RESERVATION_API_MODE=platform` and CI placeholder public env
  vars, drives `/form-booking` in headless Chromium, mocks only the `/api/v1`
  services, availability, and reservation-create responses in the browser,
  asserts platform tenant/venue/correlation/idempotency request context, and
  fails if the booking flow makes legacy reservation `/api/*` calls.
- `current-frontend:admin-platform-smoke` starts the current Next.js app with
  `NEXT_PUBLIC_RESERVATION_API_MODE=platform` and
  `NEXT_PUBLIC_RESERVATION_PLATFORM_SMOKE=1`, drives env-gated admin smoke
  harness routes in headless Chromium, mocks only the relevant `/api/v1`
  reservation, service, and resource-maintenance responses in the browser,
  asserts platform tenant/venue/correlation/idempotency request context, and
  fails if admin reservation or maintenance flows make legacy reservation
  `/api/*` calls. The harness returns `notFound()` unless the smoke flag is
  enabled, so it is not a normal admin auth bypass.
- CI and deploy verification jobs now run `pnpm run sdk:release-gate`, so the
  local-tarball external fixture gate runs before app build/deploy proceeds.
- Clean CI and deploy runners install the Playwright Chromium browser with
  `corepack pnpm run current-frontend:platform-smoke:install` after dependency
  install and before `sdk:release-gate`, because the current frontend
  platform-mode smoke is part of that release gate.
- The fixture typechecks package exports and declarations.
- The smoke runs SDK calls and direct raw `fetch` calls against the same
  in-memory `/v1` HTTP surface for metadata, availability, reservation create,
  idempotency replay, idempotency misuse, reservation read, and preserved error
  body behavior.
- The fixture verifies tenant, venue, authorization, and correlation headers on
  every request.
- The plain fixture scans its own package manifest and source for workspace
  links, local workspace-source installs, forbidden current app/backend/provider
  imports, Supabase/LangChain/provider dependencies, and server-secret markers.
- The server fixture additionally covers tenant-context reads, server/admin
  reservation listing, server bearer credential forwarding, missing credential
  errors, safe-read retry behavior, and timeout/abort behavior without
  retrying. It also scans its own package manifest and source for workspace
  links, local workspace-source installs, forbidden current
  app/backend/provider imports, Supabase/LangChain/provider dependencies, and
  server-secret markers.
- The Vite/React fixture builds a small browser page/form that imports only the
  packed SDK and contract package, uses a browser-safe `public-demo-token`,
  calls metadata, catalog, availability, create reservation, and read
  reservation through the SDK, verifies its manifest uses only the current
  local SDK/contract tarballs plus fixture-owned Vite/React dependencies, and
  scans fixture source plus bundled output for Supabase, Next.js server
  helpers, current app paths, backend package names, LangChain, Node-only
  markers, and server-secret strings.
- The Next fixture builds a minimal separate Next app that imports only the
  packed SDK and contract package plus fixture-owned Next/React dependencies,
  uses a browser-safe `public-next-demo-token`, proves SDK create/read
  reservation behavior matches raw `fetch` replay/read calls on the same
  fixture-local `/v1` surface, verifies its manifest uses only the current
  local SDK/contract tarballs plus fixture-owned Next/React dependencies, and
  scans fixture source plus `.next/server` and `.next/static` output for
  current app/backend imports and server-secret markers.
- The disabled-chat fixture verifies `client.chat.createReservationSession`,
  `sendMessage`, `streamMessage`, and `confirmReservation` preserve the exact
  backend `chat_module_disabled` error body as direct raw `fetch`, including
  tenant, venue, auth, correlation, and idempotency context. It also scans its
  own manifest/source for forbidden provider, backend, storage, current app,
  React, Next.js, Supabase, and service-secret dependencies/imports/markers.
- The enabled-chat fixture verifies `client.chat.createReservationSession`,
  `sendMessage`, `streamMessage`, and `confirmReservation` match direct raw
  `fetch` responses from the same fixture-local `/v1/chat` backend, including
  metadata module reporting, public action payloads, prepared reservation
  metadata, NDJSON stream chunks, confirmation reservation shape, tenant,
  venue, auth, correlation, and idempotency context. It also scans its own
  manifest/source for forbidden provider, backend, storage, current app,
  React, Next.js, Supabase, and service-secret dependencies/imports/markers.

This is useful external-consumer and current-frontend consumer evidence, but it
is a local-tarball proof only, not the full Phase 7 release gate. Remaining
proof includes workspace-link fast-iteration fixtures if desired, direct HTTP
parity against a real seeded backend, live enabled-chat backend/provider parity
if chat is released, live backend parity for browser flows, passed strict
private/public registry install proof against exact package versions, and final
standalone backend extraction. The registry harness is CI-safe and never
publishes; default runs skip without network/install unless mode-specific env
and `RESERVATION_SDK_REGISTRY_ALLOW_INSTALL=1` are configured.

## Deliverables

- External consumer fixture matrix.
- Plain TypeScript fixture and smoke script.
- Vite/React fixture and browser build proof.
- Separate Next.js fixture and build/smoke proof.
- Server-to-server fixture and credential-safety proof.
- Direct HTTP parity fixture comparing SDK and raw fetch.
- Optional chat fixture or disabled-chat proof.
- Workspace-link and local-tarball install scripts.
- Forbidden import/dependency checks.
- CI smoke test plan and gap log template.

## Acceptance Criteria

- `@reservation-platform/sdk` can be installed in a clean external package
  without this repository's frontend.
- The local tarball install mode passes for SDK exports, declarations,
  dependencies, and packed file list.
- Plain TypeScript, Vite/React, separate Next.js, and server-to-server fixtures
  can call representative `/v1` flows.
- Direct HTTP and SDK calls return equal success payloads and equal preserved
  error bodies for the same request context.
- Reservation flows use `ReservationResponse` and the correct method split:
  `rescheduleReservation` for movement changes and `updateReservation` for
  non-slot patches.
- Required mutations use one caller-generated idempotency key per test intent
  and prove replay/key-reuse behavior.
- Browser fixtures do not include server-only secrets.
- Smoke tests fail if SDK or fixtures import forbidden current app, backend,
  storage, Supabase, provider, or UI internals.
- Optional chat smoke tests pass locally when chat is enabled, and
  disabled-chat tests preserve `chat_module_disabled` when it is not enabled.

## Downstream Update Notes

- Phase 8 release gates must include the external smoke suite and local
  tarball install mode.
- SDK documentation must include fixture-backed examples rather than untested
  snippets.
- If fixture requirements expose missing endpoints, DTO drift, header changes,
  package export issues, idempotency mismatches, or forbidden dependencies,
  update Phase 1 through Phase 6 and the contract docs before release work
  continues.
- If install modes, package names, fixture list, forbidden import policy,
  direct HTTP parity requirements, or optional chat proof requirements change,
  update Phase 8 before publishing.
