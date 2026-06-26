# Phase 10: Live Platform Proof

## Purpose

Prove the separated backend platform works with real infrastructure, not only
local fake repositories and fixture servers.

This phase is the difference between "the code is modular" and "another
frontend can safely depend on this backend platform."

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-6-external-frontend-proof-removal-gate-results.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-7-standalone-backend-cutover.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-8-current-frontend-consumer-cutover.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-7-external-consumer-smoke-tests.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-8-packaging-versioning-release.md`
- `docs/package-refactor/backend-platform-extraction/phase-9-release-deployment-operations.md`
- live-proof scripts under `scripts/**`
- database package migration docs under `packages/database/**`

## Write Scope

- live proof scripts and docs
- CI release gates
- external consumer fixture proofs
- this phase result doc, if created
- `remaining-modularity-gaps.md`

## Non-Goals

- Do not run destructive live mutations without explicit disposable backend
  configuration and opt-in env.
- Do not publish packages from proof scripts.
- Do not treat skipped strict proofs as completed proof.
- Do not put live infrastructure credentials into docs, source, or frontend
  config.

## Required Live Proofs

| Proof | Must demonstrate |
| --- | --- |
| Deployed backend health | Public health/readiness works without database writes. |
| Database migration application | Backend-owned migrations apply to disposable database. |
| RLS and tenant isolation | Tenant A cannot read or mutate Tenant B data. |
| Durable idempotency | Replayed mutation returns stored result; key misuse fails. |
| SDK/direct parity | Clean frontend fixture and raw HTTP match live backend behavior. |
| Registry/package install | SDK installs in a clean external app from package candidate. |
| Optional chat | Disabled or enabled chat behavior is backend-owned and tenant-scoped. |

## Implementation Steps

1. Define disposable backend environment requirements and strict opt-in flags.
2. Run database migration live proof against disposable infrastructure.
3. Seed minimal tenant, venue, service, resource, availability, and reservation
   data through backend-owned assets.
4. Run live SDK/direct HTTP parity against the deployed `/v1` backend.
5. Prove tenant isolation and RLS behavior with at least two tenants.
6. Prove durable idempotency using real database persistence.
7. Run registry/package install proof in a clean external consumer.
8. Record every skipped, failed, and passed proof in the phase result doc.

## Deliverables

- Live proof environment contract.
- Strict live proof command list.
- Disposable database migration/RLS/idempotency proof.
- Live external frontend SDK/direct parity proof.
- Registry install proof result.
- Optional chat live or disabled proof result.

## Partial Implementation Result

Phase 10 now has a CI-safe readiness orchestrator:

- `corepack pnpm run backend-platform:live-proof`
- `corepack pnpm run backend-platform:live-proof:strict`
- `corepack pnpm run backend-platform:live-proof-readiness`
- `corepack pnpm run backend-platform:live-proof-readiness:strict`
- Unit test:
  `node --import tsx --test scripts\verify-standalone-backend-live-proof.test.mjs`
- Unit test:
  `node --import tsx --test scripts\verify-live-platform-proof-readiness.test.mjs`

The bounded live health proof is implemented in
`scripts/verify-standalone-backend-live-proof.mjs`. It uses a frontend-safe env
contract:

- `RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL` is required before any live
  HTTP call is made.
- `RESERVATION_STANDALONE_BACKEND_LIVE_HEALTH_PATH` defaults to `/v1/health`.
- `RESERVATION_STANDALONE_BACKEND_LIVE_TIMEOUT_MS` defaults to `5000` and is
  capped at `60000`.
- `RESERVATION_STANDALONE_BACKEND_LIVE_PROOF_STRICT=1` or `--strict` makes
  missing or malformed config fail instead of skip.

Safe mode prints `SKIPPED` and makes no network call when the standalone backend
URL, health path, or timeout are missing or malformed. When fully configured,
the proof performs a `GET` against the composed health URL and fails on non-2xx,
non-JSON, or any JSON body that does not exactly match the standalone
`apps/api` health/readiness contract:
`{ status: "ok", service: "standalone-api-skeleton", api_version: "v1", readiness: "alive" }`.
The URL builder preserves standalone backend base URLs with or without a
trailing slash, including a configured base path, before appending the health
path. This proves only that the configured standalone target answers the public
health/readiness endpoint with the expected standalone contract; it is not proof
that the target is not a compatibility route by itself, and it is not a
database, RLS, idempotency, SDK/direct parity, optional-chat, or package install
proof.

The readiness orchestrator is implemented in
`scripts/verify-live-platform-proof-readiness.mjs`. It now combines local
frontend/backend separation prerequisite gates with the existing live proof env
parsers.

The local prerequisite gates are:

- `corepack pnpm run current-frontend:consumer-repo-readiness`
- `corepack pnpm run current-frontend:consumer-install-proof`
- `corepack pnpm run backend-platform:verify-compatibility-route-removal-gate`
- `corepack pnpm run backend-platform:verify-package-graph-boundary`
- `corepack pnpm run backend-platform:verify-chat-boundary`
- `corepack pnpm run backend-platform:verify-extraction-boundary`
- `corepack pnpm run backend-platform:verify-extraction-dry-run`
- `corepack pnpm run backend-platform:verify-extracted-workspace-readiness`
- `corepack pnpm run backend-platform:verify-standalone-api-skeleton`
- `corepack pnpm run database:verify-migration-bundle`

These prerequisite surfaces are local-only checks. They validate current
frontend consumer repository readiness, compatibility route removal gate
readiness, backend package graph boundaries, provider-neutral chat package
boundaries, backend platform extraction/source boundary readiness, backend
extraction dry-run readiness, extracted backend workspace readiness,
standalone API skeleton build/test readiness, and database migration bundle
readiness before Phase 10 reports strict live-proof readiness. The
extraction/source and chat boundary gates are local-only source scans; they
prove backend-owned source has not drifted back into
Next/React/frontend/current-app/provider-runtime imports, but they do not run
or deploy a backend. The standalone API skeleton prerequisite is a local
package build/test gate. The migration bundle prerequisite verifies local
migration-index and bundle manifest readiness only; it is not
`database:live-proof` and does not connect to a database. These checks do not
create a frontend or backend repository, run extracted-repository install,
build, or test commands, delete compatibility routes, install packages,
publish packages,
deploy a backend, open a browser, call a live backend, or mutate live data.
The compatibility route removal prerequisite now reports its own
route-removal summary when the local verifier passes, including removable-route
counts and strict prepared-root proof blockers. Phase 10 therefore can show
that prerequisite as `ready` for local gate validity while still reporting that
compatibility routes remain non-removable until
`current-frontend:consumer-install-proof:strict` and
`backend-platform:extracted-install-proof:strict` pass for the affected routes.

Phase 7 local route tests now also prove configured standalone auth protects
the optional disabled-chat and injected-chat `/v1/chat/reservation-sessions/**`
family before disabled fallbacks or chat module calls. That remains a local
readiness proof only. Phase 10 live parity now makes optional chat explicit
through `RESERVATION_PLATFORM_LIVE_CHAT_MODE`. Strict readiness fails when that
mode is absent so optional chat cannot be silently ignored. `disabled` mode runs
SDK/direct HTTP parity against all four contracted disabled-chat routes and
expects the same public `chat_module_disabled` platform error status/body from
both callers. `enabled` is accepted as an explicit mode name but still fails
with a pending/unsupported message because provider-backed live chat proof has
not been implemented.

The live proof readiness surfaces still import the existing env parsers from:

- `scripts/verify-current-frontend-consumer-install-build-proof.mjs`
- `scripts/verify-extracted-backend-install-build-test-proof.mjs`
- `scripts/verify-standalone-api-deployment-config.mjs`
- `scripts/verify-standalone-backend-live-proof.mjs`
- `scripts/verify-database-live-proof.mjs`
- `scripts/verify-live-backend-parity.mjs`
- `scripts/verify-sdk-registry-install.mjs`

It does not run the strict proof commands and does not make network, database,
registry, install, publish, or live mutation calls. Some local prerequisite
surfaces remain active local gates and may run bounded repository verification
commands such as package build/test or migration-index checks through
`verifyPnpmScript`; those are not live, registry, install, publish, browser, or
mutation proofs. Safe mode reports which readiness surfaces are skipped, ready,
malformed, or locally failing. Strict readiness mode fails unless the local
prerequisite gates pass and the existing strict proof commands are configured
enough to run. The extracted backend
install/build/test proof readiness surface parses
`RESERVATION_EXTRACTED_BACKEND_PROOF_ROOT`,
`RESERVATION_EXTRACTED_BACKEND_PROOF_ALLOW_INSTALL`, and the prepared extracted
workspace `package.json` / `pnpm-lock.yaml` / generated Phase 11 verifier
script contract only; safe readiness mode itself does not run `pnpm install`
or generated backend commands from the readiness orchestrator.
The current frontend consumer install/build proof readiness surface is reported
immediately after `current-frontend:consumer-repo-readiness`. It parses
`CURRENT_FRONTEND_CONSUMER_PROOF_ROOT`,
`CURRENT_FRONTEND_CONSUMER_PROOF_ALLOW_INSTALL`, and the prepared frontend
consumer workspace `package.json` / `pnpm-lock.yaml` / generated
`typecheck`/`build`/`start` script contract only; safe readiness mode itself
does not run `pnpm install`, generated frontend commands, `start`, a dev
server, or browser checks from the readiness orchestrator. Its parser also
confirms install-relevant dependency sections do not use `workspace:`, `file:`,
`link:`, or `portal:` specs.

- `corepack pnpm run current-frontend:consumer-repo-readiness`
- `corepack pnpm run current-frontend:consumer-install-proof:strict`
- `corepack pnpm run backend-platform:verify-compatibility-route-removal-gate`
- `corepack pnpm run backend-platform:verify-package-graph-boundary`
- `corepack pnpm run backend-platform:verify-chat-boundary`
- `corepack pnpm run backend-platform:verify-extraction-boundary`
- `corepack pnpm run backend-platform:verify-extraction-dry-run`
- `corepack pnpm run backend-platform:verify-extracted-workspace-readiness`
- `corepack pnpm run backend-platform:verify-standalone-api-skeleton`
- `corepack pnpm run database:verify-migration-bundle`
- `corepack pnpm run backend-platform:verify-standalone-deployment-config:strict`
- `corepack pnpm run backend-platform:extracted-install-proof:strict`
- `corepack pnpm run backend-platform:live-proof:strict`
- `corepack pnpm run database:live-proof:strict`
- `corepack pnpm run sdk:live-parity:strict`
- `corepack pnpm run sdk:registry-install-proof:strict`

Strict SDK/direct live parity readiness now also requires
`RESERVATION_PLATFORM_LIVE_CHAT_MODE=disabled` or `enabled`. Use `disabled`
when the disposable live backend has no provider-backed chat module; the live
parity command will prove create-session, send-message, stream-message, and
confirm-reservation all return matching SDK/direct `chat_module_disabled`
errors. Use of `enabled` is intentionally not green yet: it records the desired
provider-backed proof scope but fails until the enabled live chat verifier is
implemented.

`sdk:release-gate` now runs the safe readiness orchestrator and the safe
extracted backend install/build/test proof harness alongside the existing safe
proof checks. `sdk:release-gate:strict` now runs the strict readiness
orchestrator before the existing strict proof commands, then still runs those
strict commands plus the strict extracted backend install/build/test proof.

This is readiness infrastructure only. It proves that the strict live proof
environment contract and local separation prerequisites can be checked locally
and in CI without touching live systems. The standalone backend health command
can prove deployed health/readiness only when
`RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL` targets the standalone backend
and the endpoint returns JSON 2xx. It still does not prove disposable database
migration application, RLS/tenant isolation, durable idempotency, SDK/direct
parity, registry package install, enabled provider chat behavior or provider
configuration, route deletion, frontend or backend repository creation,
extracted-repository install/build/test execution, or package publishing until
the strict commands themselves pass against disposable live infrastructure and
the later removal/repository phases explicitly perform their own actions.
Disabled-chat live parity is now part of the strict
SDK/direct live parity command when the explicit disabled mode is configured,
but it is not complete proof until that strict command passes against the
disposable live backend.

The unit test exercises the direct local verifier exports for package graph and
chat boundary readiness and the local migration-bundle command wrapper against
the current repository. It mocks the standalone API skeleton wrapper in that
current-repo unit case to keep the focused test bounded; the full
`backend-platform:live-proof-readiness` command still runs the real standalone
API skeleton build/test prerequisite.

## Acceptance Criteria

- Strict live proof commands pass against disposable infrastructure.
- Skipped safe-mode checks are clearly marked as readiness only.
- No live proof requires frontend-owned backend code.
- The backend platform can be treated as the product surface for consumers.
- Remaining gaps are narrowed to operational polish, packaging policy, or
  explicitly deferred optional modules.

## Subagent Handoff Notes

Give the worker this file plus the strict proof scripts. The worker must never
replace a strict proof with a safe skip and call it complete.
