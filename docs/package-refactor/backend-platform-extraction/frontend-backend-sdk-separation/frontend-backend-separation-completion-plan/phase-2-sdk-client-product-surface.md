# Phase 2: SDK Client Product Surface

## Goal

Make the SDK the only supported way for a frontend to call the backend platform.
The SDK must be installable by a separate frontend repo and must remain
frontend-safe.

## Inputs To Read

- `phase-0-separation-source-of-truth.md`
- `phase-1-backend-platform-repo-contract.md`
- `../phase-14-sdk-release-consumer-contract.md`
- `../phase-18-sdk-distribution-and-contract.md`
- `../phase-23-sdk-package-materialization.md`
- `../phase-27-sdk-public-release-surface.md`
- SDK package source and package manifest

## Write Scope

- SDK public exports
- SDK package manifest and build output
- SDK install/use documentation
- SDK tests and import-safety checks
- downstream updates to Phases 3, 4, and 6

## Tasks For Worker Subagent

1. Define the public SDK entrypoints for reservations, availability, bookings,
   tenants, and chat transport where applicable.
2. Ensure SDK imports are HTTP/client-safe and do not pull backend packages,
   provider SDKs, database clients, or service-role helpers.
3. Add install proof using packed tarball or local package install from a clean
   consumer fixture.
4. Document minimal frontend setup: install package, set backend base URL,
   create client, call API.
5. Stabilize public error and response mapping so non-racing frontends can use
   it.
6. Update frontend and external adoption phases when SDK usage changes.

## Review Gates

Spec reviewer rejects when:

- SDK requires files from the monorepo source tree to work;
- SDK exports backend internals;
- SDK examples only work for the racing simulator UI.

Quality reviewer rejects when:

- package metadata leaks server-only dependencies;
- tests only import TypeScript source directly and do not prove installability;
- errors are stringly typed without a stable public shape.

## Acceptance Criteria

- A clean frontend fixture can install or consume the SDK package.
- SDK import graph is frontend-safe.
- Public usage docs are app-neutral.
