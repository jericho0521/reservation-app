# Phase 4: Backend Runtime and Database Proof

## Goal

Prove the backend product can run as standalone infrastructure with real
runtime configuration and disposable database behavior.

This phase is where local module separation becomes backend-service proof.

## Inputs To Read

- `phase-1-backend-product-repository-contract.md`
- `../phase-7-standalone-backend-cutover.md`
- `../phase-10-live-platform-proof.md`
- `../phase-28-live-backend-and-external-consumer-proof.md`
- `../../backend-repo-bootstrap.md`
- `../../backend-package-ownership.md`
- database package migration docs/manifests.

## Allowed Edits

- Standalone backend runtime config and deployment readiness checks.
- Database migration bundle, RLS/idempotency proof scripts, and tests.
- Backend live proof docs and runbooks.
- Later phase docs in this folder when runtime/database requirements change.

## Work Items

- Prove standalone backend startup without frontend app code.
- Prove protected routes fail closed before repository or mutation work when
  auth is missing or invalid.
- Apply package-owned migrations to disposable database infrastructure.
- Prove tenant isolation, RLS behavior, atomic reservation behavior, and durable
  idempotency replay/misuse handling.
- Prove optional AI chat is disabled safely or enabled through backend-owned
  provider/workflow configuration.

## Acceptance Criteria

- Backend runtime env uses backend-only names and no `NEXT_PUBLIC_*` secrets.
- Disposable database proof applies the backend-owned migration plan.
- RLS/tenant isolation and idempotency behavior are asserted, not only
  configured.
- Live proof commands distinguish safe skipped readiness from strict proof.
- The backend can be deployed or run independently from the current frontend.

## Proof Commands

- Standalone API skeleton/runtime tests.
- Standalone deployment config verifier.
- Database live proof in strict disposable mode.
- SDK/direct live parity proof against the standalone backend.

Strict live/database proof is potentially mutating and should only run against
disposable infrastructure with explicit env. It is not safe against production
unless the operator intentionally points it there.

## Downstream Updates

Update Phases 5 and 6 if live backend URL requirements, database seed data,
auth headers, idempotency rules, or chat mode requirements change.
