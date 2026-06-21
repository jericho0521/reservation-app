# Phase 1: Boundary Enforcement

## Purpose

Turn the intended frontend/backend/SDK boundaries into automated checks so
future work cannot accidentally re-couple the layers.

## Inputs To Read

- Phase 0 audit output
- parent `phase-1-backend-module-boundary-results.md`
- parent `phase-2-sdk-boundary-public-client-results.md`
- parent `phase-8-current-frontend-consumer-cutover.md`
- parent `frontend-consumer-repo-inventory.json`
- backend extraction manifest
- package manifests under `apps/api` and `packages`

## Write Scope

- boundary verifier scripts
- package scripts that run boundary verifiers
- ownership/inventory docs
- downstream phase docs that depend on the checks

## Non-Goals

- Do not fix every boundary violation by moving files yet.
- Do not remove compatibility routes until proof gates pass.
- Do not make the SDK depend on backend implementation to satisfy tests.

## Work Items

1. Add or expand verifiers that fail when frontend-owned source imports:
   backend packages, database adapters, `apps/api`, service-role helpers,
   LangChain/provider workflows, or compatibility route handlers.
2. Add or expand verifiers that fail when backend-owned source imports:
   UI components, browser-only helpers, Next.js page/layout code, frontend
   route wrappers, or `NEXT_PUBLIC_*` secrets as backend config.
3. Add or expand verifiers that fail when SDK source imports:
   backend implementation, migrations, provider workflows, database clients,
   UI, or workspace-only private packages.
4. Add checks for package manifest leakage, not only TypeScript imports.
5. Make the boundary command part of the relevant release/readiness gates.

## Acceptance Criteria

- Boundary checks can run locally without network access.
- Checks fail on source imports and package manifest dependencies.
- Checks produce actionable output showing which file or package crossed the
  boundary.
- SDK remains HTTP-only and frontend-safe.
- Frontend can only reach the backend through SDK/direct public HTTP contract,
  not backend internals.

## Subagent Handoff

Give the worker this file, Phase 0 audit outputs, current verifier scripts, and
package manifests. Reviewers must reject checks that only scan a narrow hardcoded
path when the inventory already defines broader source roots.

