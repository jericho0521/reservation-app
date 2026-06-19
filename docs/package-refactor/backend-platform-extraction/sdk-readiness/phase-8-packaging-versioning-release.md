# Phase 8: Packaging, Versioning, and Release

## Purpose

Make `@reservation-platform/sdk` and
`@reservation-platform/contract-types` installable, versioned, documented, and
releasable without breaking backend `/v1` compatibility.

Release readiness means a clean external app can install the SDK package,
understand which backend API versions it supports, run fixture-backed examples,
and rely on documented auth, tenant, idempotency, error, and optional module
behavior. Packaging must preserve the Phase 0 boundary: the SDK is an HTTP
client over `/v1`, not a bundle of backend rules, storage adapters, Supabase
clients, current app UI, or provider internals.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/sdk-readiness/README.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-0-sdk-boundary-reset.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-1-backend-api-prerequisite.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-2-contract-types-package.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-3-sdk-package-scaffold.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-4-core-sdk-methods.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-5-auth-tenant-idempotency.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-6-optional-chat-sdk.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-7-external-consumer-smoke-tests.md`
- `docs/package-refactor/backend-platform-extraction/contracts/api-resource-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/sdk-method-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/error-conventions.md`
- `docs/package-refactor/backend-platform-extraction/contracts/idempotency-conventions.md`

## Write Scope

Implementation work belongs in:

- `reservation-platform-backend/packages/sdk/package.json`
- `reservation-platform-backend/packages/sdk` build, pack, test, and release
  config
- `reservation-platform-backend/packages/contract-types/package.json`
- `reservation-platform-backend/packages/contract-types` build, pack, test,
  and release config
- backend-platform release documentation and CI workflow files
- external consumer smoke test release gates from Phase 7

For this planning pass, edit only this phase doc if Phase 8 assumptions change.
Do not edit current frontend UI, backend domain packages, storage adapters,
SDK method implementation, or other phase docs unless explicitly assigned.

## Non-Goals

- Do not publish before backend `/v1`, contract types, SDK methods, auth,
  idempotency, and external consumer smoke tests are passing.
- Do not bundle backend domain rules, storage adapters, Supabase clients,
  current app internals, React/Next.js UI, LangChain, provider SDKs, or
  database migrations into the SDK package.
- Do not use package version bumps to hide breaking API changes.
- Do not release optional chat as stable until JSON, streaming,
  disabled-module, idempotency, and direct HTTP parity tests pass.
- Do not make local workspace installs the only proof of release readiness.
- Do not rename `@reservation-platform/sdk`,
  `@reservation-platform/contract-types`,
  `reservation-platform-backend/packages/sdk`, or
  `packages/contract-types` without updating all SDK readiness and contract
  docs.

## Release Modes

| Mode | Audience | Requirements |
| --- | --- | --- |
| Local tarball | SDK development and pre-release verification | `npm pack` or package-manager equivalent, install into Phase 7 fixtures, verify `exports`, `.d.ts`, file list, dependency metadata, and forbidden imports. |
| Private registry | Internal pilots or customer-specific trials | Authenticated registry publish, immutable versions, changelog, compatibility matrix, smoke tests against target backend, rollback plan. |
| Public npm | Public product release if product direction allows | Public docs, semver policy, support/deprecation policy, security contact, provenance where available, post-publish external install verification. |

Local tarball verification is mandatory for every release candidate. Private
and public registry modes add distribution controls, but they do not replace
the tarball and external fixture checks.

## Package Names And Exports

Default package names and source paths:

- SDK source: `reservation-platform-backend/packages/sdk`
- SDK package: `@reservation-platform/sdk`
- Contract types source: `reservation-platform-backend/packages/contract-types`
- Contract types package: `@reservation-platform/contract-types`

SDK package requirements:

- ESM root export for modern browsers and Node runtimes with `fetch`.
- Type declarations for all public exports.
- Stable root exports from Phase 3 and Phase 4, including
  `createReservationPlatformClient`, `ReservationPlatformClient`,
  `RequestOptions`, `PlatformError`, `isPlatformError`, and selected DTO
  re-exports.
- Optional chat export shape documented if released: base namespace, subpath
  export, or companion package.
- `files` allowlist that excludes source-only tests, current app files,
  backend domain packages, storage adapters, migrations, secrets, and local
  fixtures unless intentionally published as examples.

## Version Tracks

| Track | Example | Owner | Breaking-change meaning |
| --- | --- | --- | --- |
| API version | `/v1` | Backend API | Endpoint paths, request/response DTOs, status/error/idempotency semantics. |
| SDK package version | `@reservation-platform/sdk@x.y.z` | SDK package | Public SDK methods, request options, exports, runtime support, error class behavior. |
| Contract types version | `@reservation-platform/contract-types@x.y.z` | Contract package | Public DTO names, schemas, error shapes, generated artifacts. |
| Backend release/migration version | backend deployment tag | Backend platform | Runtime behavior, data migrations, feature flags, compatibility notices. |
| Optional chat module version | package export or backend module marker | Backend chat/API | Chat DTOs, stream events, disabled-module behavior, confirmation semantics. |

Versioning policy:

- Use semver for SDK and contract packages.
- Patch releases fix implementation bugs without changing public contracts.
- Minor releases add backward-compatible methods, DTO fields, options, or
  optional modules.
- Major releases remove or rename public APIs, change required request
  context, change default retry/idempotency behavior, change DTO names, or
  drop supported runtime/API versions.
- Backend `/v1` compatibility must be listed for every SDK release.
- Contract types and SDK can release together by default; independent releases
  are allowed only when the compatibility matrix proves the pairing.

## Compatibility Matrix

Every release must publish a matrix like this:

| SDK version | Contract types version | Supported API version | Backend minimum | Optional modules | Notes |
| --- | --- | --- | --- | --- | --- |
| `0.1.x` | `0.1.x` | `/v1` preview | backend tag or date | chat disabled or preview | Initial external smoke-test track. |

The matrix must include:

- supported `@reservation-platform/sdk` versions
- supported `@reservation-platform/contract-types` versions
- supported backend `/v1` API version and minimum backend deployment
- required auth, tenant, venue, correlation, and idempotency header behavior
- runtime support: modern browser, Node with global `fetch`, caller-provided
  `fetch` fallback if needed
- optional chat support and stream event compatibility when released
- known deprecations and removal dates

## CI Release Gates

Release candidate CI must fail on:

- SDK build failure.
- Contract types build failure.
- Type declaration generation failure.
- SDK unit test failure.
- Contract schema validation test failure.
- Direct HTTP parity test failure.
- Phase 7 external consumer smoke test failure.
- Local tarball install failure.
- Registry install proof env/config drift, including malformed private/public
  mode selection, non-exact package specs, missing private registry URL/token
  when private mode is selected, or missing explicit install opt-in in strict
  publish/pilot proof.
- Packed package `exports` or file-list failure.
- Forbidden dependency/import check failure.
- Browser bundle check that finds server-only secrets, Node-only root APIs,
  Supabase service clients, backend domain packages, storage adapters, current
  app internals, React/Next.js UI, LangChain, provider SDKs, or migrations.
- OpenAPI/JSON Schema drift from `@reservation-platform/contract-types`.
- Database SQL ownership inventory drift, including missing current SQL files,
  inventory entries pointing at missing SQL, content/reporting SQL classified
  as core platform, or loss of the explicit canonical/duplicate atomic RPC
  pairing.
- Database migration bundle planning drift, including missing asset coverage
  from the SQL ownership inventory, incorrectly ordered core migration targets,
  optional AI retrieval targets outside their optional folder, development
  seed/compat targets outside the development seed folder, non-platform
  blogs/sales-report SQL promoted into runnable migrations, or duplicate
  atomic RPC mirrors treated as runnable migrations.
- Database migration index drift, including stale package-owned migration or
  seed paths, exact core order, optional/development classification, sha256
  checksums, or byte sizes in
  `packages/database/migrations/supabase/migration-index.json`.
- Missing changelog, compatibility matrix, or docs for changed behavior.

Recommended CI order:

1. Lint/typecheck contract types and SDK.
2. Build contract types and SDK.
3. Run unit and contract tests.
4. Run forbidden import/dependency checks.
5. Run backend source boundary, database SQL ownership inventory, and migration
   bundle planning checks.
6. Pack local tarballs.
7. Install tarballs into external fixtures.
8. Run direct HTTP parity and smoke flows against seeded backend.
9. Generate release notes and compatibility matrix.

Current branch implementation for the local-tarball subset:

- `@reservation-platform/contract-types` now generates package-owned
  `packages/contract-types/contracts/openapi.json` and
  `packages/contract-types/contracts/json-schema/*.schema.json` from
  `src/contract-artifact-registry.ts`.
- `corepack pnpm --filter @reservation-platform/contract-types run contracts:check`
  fails on stale or unexpected OpenAPI/JSON Schema artifacts and is part of the
  contract package `test` script.
- Root `sdk:release-gate` runs the current frontend source secret scan,
  `packages:pack`, packed package boundary verification against exact current
  package versions, fixture tarball manifest checks, local-tarball fixture
  installs, and all current external fixture smokes. It now runs the contract
  artifact drift check before packing.
- `sdk:fixtures:sync-tarballs` rewrites fixture tarball specs from the current
  SDK and contract package versions, while `sdk:fixtures:check-tarballs` fails
  release-gate runs when version bumps leave fixture manifests stale.
- `sdk:release-artifacts:generate` writes deterministic local
  release-candidate compatibility matrix and release notes artifacts from the
  current SDK package version, contract-types package version, and generated
  contract OpenAPI metadata.
- `sdk:release-artifacts:check` fails when those release artifacts are missing
  or stale, and root `sdk:release-gate` runs this check after contract artifact
  drift checking and before packing.
- `current-frontend:verify-platform-secrets` fails the release gate when the
  current browser/platform-facing frontend source includes server-only secret
  markers, non-public env access, or direct server Supabase imports. This is a
  source-level gate only; bundle/manifest and live backend secret checks remain
  separate hardening work.
- `backend-platform:verify-extraction-boundary` fails the release gate when
  current backend-platform candidate source surfaces import or reference
  frontend pages/components, admin UI, React/client-only modules, browser
  globals, browser Supabase helpers, or the current frontend platform client.
  It scans only `app/api/v1`, `packages/reservations-core/src`,
  `packages/reservations-supabase/src`, `packages/ai-chat/src`,
  `packages/reservation-chat-core/src`, `packages/contract-types/src`, and
  `packages/reservation-platform-api/src`, excluding tests and
  generated/non-source areas. `packages/ai-chat` is the backend-owned optional
  chat package; `packages/reservation-chat-core` is included as
  compatibility/reference migration context while it remains in the workspace.
  This is a source-level extraction boundary gate only; it does not
  prove live seeded backend parity, complete database migration ownership,
  enabled chat parity, private/public registry verification, or actual separate
  repository extraction.
- `backend-platform:verify-extraction-manifest` fails the release gate when the
  standalone backend extraction manifest is malformed, references missing
  current-source paths, targets paths outside approved backend repository
  areas, omits exclusion rationale, or marks known frontend/current-app,
  analytics, content, browser Supabase, or frontend platform client paths as
  backend move/copy candidates. This is an extraction readiness gate only; it
  does not create the standalone repository or move files.
- `backend-platform:verify-extraction-dry-run` fails the release gate when the
  manifest's move/copy candidates cannot be enumerated into deterministic
  backend target paths, when compatibility shims would be copied verbatim, when
  excluded paths appear in the planned file set, or when planned files include
  generated/install/cache artifacts, target collisions, invalid paths,
  frontend/current-app targets, or ambiguous multi-target mappings. This is a
  read-only extraction-plan guardrail only; it does not create or populate the
  standalone repository and does not prove live backend parity.
- `database:verify-sql-ownership` fails the release gate when current `.sql`
  files under `supabase/` or `packages/reservations-supabase/sql/` are missing
  from `database-sql-ownership-inventory.json`, when inventory entries point to
  missing SQL files, when content/reporting SQL is classified as core platform,
  or when the root/package atomic RPC duplicate pair is not explicitly recorded
  as canonical core plus duplicate core. This is a deterministic, read-only,
  source/inventory check only; it does not install migrations, execute SQL,
  prove tenant isolation/RLS, prove live seeded backend parity, or complete the
  standalone database package extraction.
- `database:verify-migration-bundle` fails the release gate when the Phase 5
  migration bundle manifest does not account for every inventoried SQL asset,
  when core migration targets are not unique and ordered as `000001` through
  `000011`, when runnable target files are missing from `packages/database`,
  when optional AI retrieval or development seed/compat entries leave their
  dedicated target folders, when non-platform blogs/sales-report SQL is not
  excluded, or when the package atomic RPC mirror is treated as a runnable
  migration instead of duplicate-only evidence for the canonical RPC migration.
  The same command first checks the generated package-owned migration index for
  stale paths, exact order, optional/development classification, sha256
  checksums, and byte sizes. This is a source/package-scaffold guardrail only;
  it does not execute SQL, create a database, prove tenant isolation/RLS, prove
  live seeded backend parity, prove durable idempotency, or complete the
  standalone database package extraction.
- CI and deploy verification jobs run `pnpm run sdk:release-gate` before the
  application build/deploy path proceeds.
- CI and deploy verification jobs also run
  `pnpm run current-frontend:platform-smoke:install` after dependency install
  and before `sdk:release-gate` so fresh Ubuntu runners have the Playwright
  Chromium browser required by the current frontend platform-mode smoke.
- This covers the current packed boundary, current frontend source-level secret
  scan, current backend-platform candidate source boundary scan, database SQL
  ownership source inventory scan, migration bundle planning and checksum-index
  scan, local tarball install, forbidden
  import/dependency scan, local
  OpenAPI/JSON Schema artifact drift check, and fixture smoke gate for plain
  TypeScript, server-to-server, Vite/React, separate Next.js, disabled-chat,
  enabled-chat fixtures, and mocked current-frontend booking/admin platform-mode browser
  wiring. It also covers generated/checkable local release-candidate release
  notes and compatibility matrix artifacts under
  `docs/package-refactor/backend-platform-extraction/sdk-readiness/release-artifacts/`.
- `sdk:live-parity` is now included as a safe live backend readiness gate. It
  skips without live env; when configured, it compares SDK/direct HTTP
  metadata, service, resource, and availability reads against the same live
  `/v1` backend. `sdk:live-parity:strict` also requires
  `RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS=1` against a disposable seeded
  backend, creates through the SDK, replays the same idempotency key through
  direct HTTP, and compares reservation reads through both paths.
- `sdk:registry-install-proof` is now included as a safe registry readiness
  gate. It exports the unit-tested `readSdkRegistryInstallConfig` parser,
  supports `RESERVATION_SDK_REGISTRY_PROOF_MODE=private|public`, requires exact
  package version specs through `RESERVATION_SDK_REGISTRY_PACKAGE_SPECS`, and
  validates private registry URL/token shape when private mode is selected.
  Default CI exits `SKIPPED` without installing anything when the env is absent,
  incomplete, malformed, or lacks the explicit
  `RESERVATION_SDK_REGISTRY_ALLOW_INSTALL=1` opt-in.
- `sdk:release-gate:strict` is the publish/pilot readiness gate. It runs the
  normal local `sdk:release-gate` and then requires `sdk:live-parity:strict`
  and `sdk:registry-install-proof:strict`. This prevents skipped live backend
  or registry install checks from being treated as proof that an unrelated
  frontend can plug into a real backend service or install from a registry.
- It does not yet cover completed strict live seeded backend parity, real
  enabled-chat provider/workflow or live backend parity, a passed strict
  private/public registry install proof, executed database migrations,
  RLS/tenant isolation proof, public changelog publication, or final standalone
  backend extraction.

## Documentation Requirements

Release docs must include:

- Installation for local tarball, private registry, and public npm modes.
- Minimal client construction example using `baseUrl`, `tenantId`, `venueId`,
  and `getAccessToken`.
- Browser-safe auth example with no server-only secrets.
- Server-to-server example that keeps server credentials off the browser.
- Header/request context reference from Phase 5.
- Idempotency guide: one key per user intent, required mutation list, replay,
  key misuse, and retry safety.
- Error handling guide showing preserved `PlatformError` fields and frontend
  responsibility for user-facing copy.
- Core method reference aligned with `contracts/sdk-method-list.md`.
- DTO reference naming `ReservationResponse` as canonical.
- Clear split between `rescheduleReservation` movement changes and
  `updateReservation` non-slot patches.
- Direct HTTP parity examples for consumers that choose not to install the SDK.
- Optional chat docs only when released, including JSON, streaming,
  disabled-module, idempotency, and provider-secret boundaries.
- Compatibility matrix and deprecation notices.

## Rollback And Deprecation Behavior

Rollback:

- Prefer fixing forward with a patch release when the package is already
  public and the issue does not expose secrets or cause data corruption.
- For private registry releases, unpublish or yank only when the registry and
  consumers support it safely.
- For public npm releases, avoid unpublish except for severe security or
  accidental-secret incidents; publish a patched version and deprecate the bad
  version with a clear message.
- Backend rollbacks must preserve the compatibility matrix or explicitly mark
  affected SDK versions as unsupported.

Deprecation:

- Deprecate before removing public methods, DTO fields, headers, options,
  error codes, package exports, or optional module behavior.
- Include replacement guidance and earliest removal version/date.
- Keep direct HTTP and SDK deprecation notices aligned.
- Do not remove `ReservationResponse`, `rescheduleReservation`, or
  `updateReservation` semantics within `/v1` without a major SDK release and a
  backend API version plan.
- Optional chat preview features may have shorter deprecation windows only if
  marked preview in the compatibility matrix and docs.

## Implementation Steps

1. Confirm package names, source paths, package ownership, and registry mode.
2. Prepare build, typecheck, test, pack, and registry-publish scripts for
   `@reservation-platform/sdk` and `@reservation-platform/contract-types`;
   preparing scripts is allowed before gates pass, executing registry publish
   is not.
3. Add package `exports`, `files`, dependency metadata, license, repository,
   provenance/security metadata where required, and side-effect flags.
4. Add changelog and release note generation tied to SDK/API/contract changes.
   Current local release-candidate artifacts are generated and checked by
   `sdk:release-artifacts:*`; public changelog publication remains pending.
5. Generate the compatibility matrix for each release candidate and publish it
   only to docs/release artifacts until external smoke and tarball gates pass.
   Current local release-candidate matrix generation/checking is implemented.
6. Wire CI gates for builds, tests, schema drift, direct HTTP parity, external
   smoke fixtures, tarball install, and forbidden imports.
7. Verify local tarball install across Phase 7 fixtures.
8. After Phase 7 external smoke and local tarball gates pass, execute private
   registry publish/install verification before internal release, if used.
   Current branch readiness covers only install proof configuration and an
   explicit no-publish install/type-import verifier; publish remains outside
   the script.
9. After Phase 7 external smoke and local tarball gates pass, execute public
   npm publish only if product direction allows it, then verify public install
   by exact version with the strict registry install proof.
10. Publish documentation covering installation, auth, tenant/venue context,
    idempotency, errors, direct HTTP parity, core methods, optional chat, and
    deprecation policy.
11. Define rollback/deprecation runbooks for SDK, contract types, and backend
    compatibility changes.

## Deliverables

- SDK and contract-types release workflow plan.
- Local tarball, private registry, and public npm release mode checklist.
- Package `exports` and packed file-list policy.
- Semver and API compatibility policy.
- Compatibility matrix template.
- CI release gate checklist.
- Installation and usage documentation requirements.
- Rollback and deprecation runbook.

## Acceptance Criteria

- External apps can install `@reservation-platform/sdk` and
  `@reservation-platform/contract-types` without this repository's frontend.
- Local tarball installation passes in Phase 7 fixtures before any registry
  publish.
- SDK release notes state compatible backend `/v1` versions and compatible
  `@reservation-platform/contract-types` versions.
- CI fails if API/SDK parity, contract schema validation, external smoke tests,
  package exports, tarball installation, forbidden import checks, or docs are
  missing or failing.
- Published docs cover auth, tenant, venue, correlation, idempotency, timeout,
  retry, error preservation, browser/server secret rules, and direct HTTP
  parity.
- Core docs and examples use `ReservationResponse`, `rescheduleReservation`
  for movement changes, and `updateReservation` for non-slot patches.
- Optional chat is either clearly absent/disabled or released with documented
  JSON, streaming, idempotency, disabled-module, and compatibility behavior.
- Rollback and deprecation behavior is documented before private or public
  release.

## Downstream Update Notes

- Release results should feed back into Phase 7 fixture docs and any public SDK
  installation examples.
- If release gates reveal contract drift, missing DTOs, auth/idempotency
  mismatches, forbidden dependencies, broken package exports, or smoke-test
  failures, update the responsible earlier phase before publishing.
- If package names, source paths, registry mode, versioning policy,
  compatibility matrix fields, CI gates, optional chat packaging, rollback
  behavior, or deprecation windows change, update Phase 0 through Phase 7 and
  the contract docs before the next release candidate.
