# Phase 1: Backend Product Repository Candidate

## Goal

Materialize a backend product repository candidate that contains only backend
platform concerns and can be evaluated without the current frontend app.

## Backend Owns

- `/v1` API runtime and route handlers
- reservation/resource/catalog/domain services
- persistence adapters and database migrations
- auth, tenant, venue, role/scope, and idempotency enforcement
- AI chat workflow services and provider/retrieval integrations
- backend deployment, environment, observability, and release checks

## Backend Must Not Own

- current frontend app routes/pages/components
- browser-only clients and UI state
- compatibility route files from the current Next.js host
- frontend smoke fixtures except as external consumers
- SDK internals beyond consuming the public contract as a test client

## Inputs To Read

- Phase 0 from this folder
- `../phase-11-backend-repo-extraction.md`
- `../phase-13-backend-platform-product-repo.md`
- `docs/package-refactor/backend-platform-extraction/backend-repo-bootstrap.md`
- `docs/package-refactor/backend-platform-extraction/backend-package-ownership.md`
- `docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json`
- `scripts/verify-standalone-backend-extraction-dry-run.mjs`
- `scripts/verify-backend-platform-extraction-boundary.mjs`
- `apps/api/**`
- backend-owned `packages/**`

## Worker Tasks

1. Update the extraction manifest so backend product repo contents are explicit:
   move, copy, generated, excluded, and reference-only.
2. Ensure backend repository metadata is not just monorepo metadata copied over.
   It needs backend-only scripts, workspace/package graph, tsconfig, env docs,
   and deploy docs.
3. Add or strengthen a verifier that fails when backend candidate source imports
   current frontend app files, Next compatibility routes, browser helpers, UI
   dependencies, or workspace-only package assumptions.
4. Prove backend package dependency closure from the candidate package manifests,
   not from the root monorepo manifest.
5. Update Phases 2-6 when backend package names, API routes, env, or ownership
   changes.

## Proof Commands

- `corepack pnpm run backend-platform:verify-extraction-boundary`
- `corepack pnpm run backend-platform:verify-extraction-dry-run`
- `corepack pnpm run backend-platform:verify-extracted-workspace-readiness`
- `corepack pnpm run backend-platform:verify-package-graph-boundary`

These commands are safe local verification commands. They inspect manifests and
source boundaries or generate temporary candidates; they must not publish,
deploy, or delete tracked source.

## Acceptance Criteria

- Backend candidate excludes frontend and compatibility-only source by policy and
  by failing verifier.
- Backend candidate has enough generated metadata to be evaluated as its own
  repository.
- Candidate dependency closure is package-local and does not rely on hidden root
  dependencies.
- Phase 4 can use the backend candidate as the source of live backend proof.
