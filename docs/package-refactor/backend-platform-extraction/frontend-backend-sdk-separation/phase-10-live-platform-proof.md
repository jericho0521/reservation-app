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

- `corepack pnpm run backend-platform:live-proof-readiness`
- `corepack pnpm run backend-platform:live-proof-readiness:strict`
- Unit test:
  `node --import tsx --test scripts\verify-live-platform-proof-readiness.test.mjs`

The readiness orchestrator is implemented in
`scripts/verify-live-platform-proof-readiness.mjs`. It now combines local
frontend/backend separation prerequisite gates with the existing live proof env
parsers.

The local prerequisite gates are:

- `corepack pnpm run current-frontend:consumer-repo-readiness`
- `corepack pnpm run backend-platform:verify-compatibility-route-removal-gate`

These prerequisite surfaces are local-only checks. They validate current
frontend consumer repository readiness and compatibility route removal gate
readiness before Phase 10 reports strict live-proof readiness. They do not
create a frontend repository, delete compatibility routes, install packages,
publish packages, deploy a backend, open a browser, call a live backend, or
mutate live data.

The live proof readiness surfaces still import the existing env parsers from:

- `scripts/verify-standalone-api-deployment-config.mjs`
- `scripts/verify-database-live-proof.mjs`
- `scripts/verify-live-backend-parity.mjs`
- `scripts/verify-sdk-registry-install.mjs`

It does not run the strict proof commands and does not make network, database,
registry, install, publish, or live mutation calls. Safe mode reports which
readiness surfaces are skipped, ready, malformed, or locally failing. Strict
readiness mode fails unless the local prerequisite gates pass and the existing
strict proof commands are configured enough to run:

- `corepack pnpm run current-frontend:consumer-repo-readiness`
- `corepack pnpm run backend-platform:verify-compatibility-route-removal-gate`
- `corepack pnpm run backend-platform:verify-standalone-deployment-config:strict`
- `corepack pnpm run database:live-proof:strict`
- `corepack pnpm run sdk:live-parity:strict`
- `corepack pnpm run sdk:registry-install-proof:strict`

`sdk:release-gate` now runs the safe readiness orchestrator alongside the
existing safe proof checks. `sdk:release-gate:strict` now runs the strict
readiness orchestrator before the existing strict proof commands, then still
runs those strict commands unchanged.

This is readiness infrastructure only. It proves that the strict live proof
environment contract and local separation prerequisites can be checked locally
and in CI without touching live systems. It does not prove deployed backend
health, disposable database migration application, RLS/tenant isolation, durable
idempotency, SDK/direct parity, registry package install, optional chat
behavior, route deletion, frontend repository creation, or package publishing
until the strict commands themselves pass against disposable live
infrastructure and the later removal/repository phases explicitly perform
their own actions.

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
