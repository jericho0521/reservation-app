# Phase 2: SDK Public Boundary Lock

## Purpose

Make the SDK the only installable integration surface for frontends. It should
be HTTP-only, frontend-safe, and usable by a different app without importing
backend implementation code.

## Write Scope

- Define the SDK public exports and contract types.
- Strengthen scans that block backend, database, migration, provider workflow,
  server-only auth, and frontend UI imports from SDK source and package
  artifacts.
- Add or update pack/install proof commands for a clean external fixture.
- Document SDK versioning, compatibility, and package artifact expectations.

## Non-Goals

- Do not publish to a registry without explicit approval.
- Do not move backend behavior into the SDK.
- Do not make the SDK depend on workspace links as the only install proof.
- Do not add UI components to the SDK.

## Required Checks

- SDK package exports are narrow and documented.
- SDK artifact inspection fails if backend-only files, migrations, service-role
  secrets, provider workflows, or UI files are included.
- Clean fixture install proof can run from a packed artifact or configured
  registry package, not only from local workspace source.
- SDK/direct HTTP parity proves SDK calls target `/v1` on a configured backend
  origin.

## Acceptance Criteria

- A new frontend can install the SDK and call the backend platform without
  importing this repository's frontend or backend implementation.
- SDK consumers have clear setup docs: backend base URL, auth/context headers,
  idempotency keys, errors, and compatibility expectations.
- The SDK remains safe to ship to browser applications.

## Downstream Update Requirement

If SDK exports, package names, dependency rules, auth/header behavior, or error
contracts change, update Phases 3 through 5.

