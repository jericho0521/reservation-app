# Phase 3: SDK Public Install and Contract Surface

## Purpose

Make the SDK the only package a frontend needs to integrate with the backend
platform. This phase answers: can a clean app install the SDK and contract types
without workspace links, backend internals, database clients, or UI code?

## Inputs To Read

- `phase-1-backend-product-repository-contract.md`
- `phase-2-deployable-backend-runtime-and-database-ownership.md`
- `../phase-27-sdk-public-release-surface.md`
- `../phase-30-package-source-and-frontend-proof.md`
- `../phase-33-sdk-direct-parity-proof.md`
- `../phase-34-registry-release-proof.md`
- `packages/reservation-platform-sdk`
- `packages/reservation-platform-contract-types`
- SDK package proof scripts

## Write Scope

- SDK public export list;
- package metadata, dependency, and artifact scans;
- install quickstart;
- SDK/direct HTTP parity expectations;
- package source decision for local tarball, private registry, or public
  registry.

## Non-Goals

- Do not publish to a public or private registry without explicit approval.
- Do not add backend service logic, database code, LangChain workflows, or UI to
  the SDK.
- Do not require consumers to use this monorepo, workspace links, or local path
  dependencies.

## Steps

1. Freeze SDK public exports and contract types.
2. Verify package artifacts exclude backend internals, migrations, service-role
   config, provider workflows, UI, and workspace metadata.
3. Prove clean install from the chosen package source.
4. Prove type imports and basic SDK calls from an external fixture.
5. Run SDK/direct HTTP parity against the same standalone backend used by
   Phase 2.
6. Update Phases 4, 5, and 6 if package name, version, install source, auth
   headers, or error behavior changes.

## Acceptance Criteria

- Clean external install works without `workspace:`, `file:`, `link:`, or
  `portal:` dependencies.
- SDK exports are documented and stable.
- SDK sends the expected auth, tenant, venue, and idempotency headers.
- SDK behavior matches direct `/v1` HTTP behavior against the standalone
  backend.
- Consumer quickstart explains only frontend-safe setup.

## Subagent Handoff Notes

This worker should not solve missing backend behavior inside the SDK. Missing
behavior becomes a Phase 1 or Phase 2 backend requirement, then this phase
updates after the backend contract changes.
