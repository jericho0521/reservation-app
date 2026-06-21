# Phase 1: Backend Product Repository Contract

## Purpose

Define the backend GitHub repository as the product. This repo should be useful
without the current frontend because it owns the `/v1` API, backend modules,
database assets, auth/tenant rules, idempotency, optional AI workflows, and
operations.

## Inputs To Read

- `phase-0-product-boundary-source-of-truth.md`
- `../backend-repo-bootstrap.md`
- `../backend-package-ownership.md`
- `../standalone-backend-extraction-manifest.json`
- `../phase-11-backend-repo-extraction.md`
- `../phase-25-backend-product-repo-contract.md`
- `apps/api/package.json`
- backend-owned `packages/*/package.json`

## Write Scope

- backend product repository contract docs
- backend package ownership docs
- extraction manifest updates
- backend-only verifier requirements
- downstream updates to Phases 2 through 6

## Non-Goals

- Do not create the physical repository in this phase.
- Do not include frontend pages, UI components, or current-app compatibility
  route files in the backend product repo.
- Do not publish the SDK.

## Product Contract

The backend product repository must expose:

- deployable `/v1` API service;
- health and metadata endpoints;
- reservation, resource, catalog, availability, maintenance, and optional chat
  API contracts;
- backend-only runtime configuration;
- database migration bundle and RLS ownership;
- durable idempotency persistence;
- auth, tenant, venue, role, and scope enforcement;
- SDK release or artifact generation path;
- operations runbooks and compatibility/deprecation policy.

## Subagent Tasks

1. Convert the ownership inventory into backend repo inclusion/exclusion rules.
2. Verify backend package manifests do not depend on frontend-only packages.
3. Define required backend repo scripts for install, test, build, database
   proof, live proof readiness, and release gates.
4. Identify remaining backend product blockers and map each one to a later
   phase.
5. Update Phase 2 if package inclusion, scripts, or runtime env expectations
   change.
6. Update Phases 3 through 6 if API or SDK release assumptions change.

## Review Gates

Spec reviewer must reject the phase when:

- the backend product repo contract depends on the current frontend;
- compatibility routes are included as canonical backend API source;
- backend runtime env includes `NEXT_PUBLIC_*` secrets;
- database, RLS, idempotency, or auth ownership is left undefined.

Quality reviewer must reject the phase when:

- the contract cannot be verified by scripts later;
- package visibility or private/public status is ambiguous;
- release and operations responsibilities are mixed into frontend docs only.

## Acceptance Criteria

- The backend repo contract stands alone as a product boundary.
- Backend inclusion/exclusion rules are explicit.
- Later phases know exactly what the backend repo must materialize and prove.
