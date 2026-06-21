# Phase 13: Backend Platform Product Repository

## Purpose

Turn the backend platform into the product surface: an independently testable,
deployable, and maintainable repository or service boundary.

This phase goes beyond extracting files. It defines what the backend repository
owns after separation and what consumers are allowed to depend on.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-7-standalone-backend-cutover.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-10-live-platform-proof.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-11-backend-repo-extraction.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-12-frontend-repo-consumer-proof.md`
- `docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json`
- `docs/package-refactor/backend-platform-extraction/backend-repo-bootstrap.md`
- `docs/package-refactor/backend-platform-extraction/backend-package-ownership.md`
- `apps/api/**`
- backend-owned `packages/**`
- backend platform scripts under `scripts/**`

## Write Scope

- backend repository bootstrap docs
- backend package ownership docs
- backend-only CI and release gate docs
- extraction manifest updates
- deployment/runtime config docs
- this phase result doc, if created
- `remaining-modularity-gaps.md`

## Non-Goals

- Do not include current frontend UI code in the backend product repository.
- Do not make compatibility `app/api/**` routes canonical backend code.
- Do not require a consumer frontend repository to install backend-only
  packages.
- Do not put live secrets into source or docs.

## Product Boundary

The backend product repository owns:

- `/v1` API implementation
- domain services
- repository interfaces and storage adapters
- database migration bundle and live proof tooling
- auth, tenant, venue, idempotency, and rate-limit enforcement
- optional AI chat backend module
- backend deployment configuration
- SDK package source if the release model keeps SDK and backend together

It does not own:

- current frontend pages/components
- frontend analytics presentation
- frontend auth UX
- current-app compatibility routes as canonical source
- consumer application deployment config

## Implementation Steps

1. Convert the extraction manifest and Phase 11 package ownership table into a
   backend product ownership manifest.
2. Promote the Phase 11 backend repository bootstrap guide into product-level
   install, test, database, runtime, and deployment steps.
3. Add backend-only CI gates for package build, boundary scans, migration
   bundle verification, standalone API tests, and strict live proof hooks.
4. Define which packages are private backend internals versus public consumer
   packages.
5. Add a compatibility policy for current-app routes that remain only as
   temporary adapters outside the backend product repository.
6. Update Phase 14 when backend repo ownership changes SDK publishing or
   versioning.
7. Update Phase 15 when backend repo operations require new runbooks or release
   steps.

## Deliverables

- Backend product ownership manifest.
- Backend repository bootstrap guide.
- Backend-only CI/release gate list.
- Package visibility table.
- Deployment/runtime configuration contract.
- Compatibility route exclusion policy.

## Acceptance Criteria

- A subagent can tell exactly which files belong in the backend product repo.
- Backend tests and boundary scans can run without the current frontend app.
- Consumers have no reason to import backend internals.
- The backend repository can be deployed independently.
- SDK ownership and release coupling are explicit.

## Subagent Handoff Notes

Give the worker this file plus Phase 11 and the extraction manifest. The worker
must update downstream SDK and operations phases when it changes package
ownership, release coupling, or deployment expectations.
