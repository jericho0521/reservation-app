# Phase 2: SDK Productization

## Goal

Turn the SDK into a frontend-safe product package that another app can install
without depending on backend source, workspace aliases, or this monorepo.

## Inputs To Read

- `phase-0-current-separation-truth.md`
- `phase-1-backend-platform-repo-hard-boundary.md`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-12-frontend-repo-consumer-proof.md`
- `../phase-14-sdk-release-consumer-contract.md`
- `../phase-18-sdk-distribution-and-contract.md`
- `../phase-23-sdk-package-materialization.md`
- `../phase-27-sdk-public-release-surface.md`
- SDK package source and package manifest

## Write Scope

- SDK source and package metadata
- SDK package tests
- frontend consumer readiness checks
- this phase file and downstream phase docs

## Tasks For Worker Subagent

1. Define the public SDK exports: client factory, public request/response types,
   error model, auth/header configuration, and optional helpers.
2. Remove or block backend implementation exports from the SDK.
3. Ensure SDK dependencies are frontend-safe and do not include database,
   Supabase server clients, LangChain/provider SDKs, migrations, or Next server
   internals.
4. Add install proof using a packed tarball or registry-style artifact, not only
   workspace links.
5. Add package-level build/typecheck tests that run outside the monorepo path
   assumptions.
6. Update frontend and external consumer phases if SDK install or API usage
   changes.

## Review Gates

Spec reviewer rejects when:

- SDK exports backend services or persistence adapters;
- install proof relies only on `workspace:*`;
- SDK behavior cannot be pointed at an arbitrary backend base URL.

Quality reviewer rejects when:

- package scripts are incomplete or rely on root-only tooling;
- public types are mixed with internal backend-only types;
- error handling is inconsistent between direct HTTP and SDK calls.

## Acceptance Criteria

- SDK package can be packed and installed by a separate frontend fixture.
- SDK has a stable public API and frontend-safe dependency graph.
- SDK calls the backend through HTTP only.
