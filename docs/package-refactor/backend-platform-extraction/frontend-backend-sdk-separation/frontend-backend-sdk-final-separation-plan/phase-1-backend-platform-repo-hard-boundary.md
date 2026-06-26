# Phase 1: Backend Platform Repo Hard Boundary

## Goal

Make the backend platform extractable as its own repository and deployable
service, not a set of modules that only work because the current frontend sits
beside them.

## Inputs To Read

- `phase-0-current-separation-truth.md`
- `../phase-11-backend-repo-extraction.md`
- `../phase-13-backend-platform-product-repo.md`
- `../phase-16-physical-backend-repo-split.md`
- `../phase-21-backend-repo-materialization.md`
- `../phase-25-backend-product-repo-contract.md`
- `../../standalone-backend-extraction-manifest.json`
- `scripts/verify-backend-platform-extraction-boundary.mjs`
- `scripts/verify-standalone-backend-extraction-dry-run.mjs`

## Write Scope

- backend extraction manifest
- backend boundary verification scripts and tests
- backend repo bootstrap docs
- this phase file and downstream phase docs

## Tasks For Worker Subagent

1. Ensure the backend candidate contains API handlers, domain services,
   persistence adapters, migrations, auth/tenant enforcement, idempotency, AI
   workflow runtime, and operations docs.
2. Ensure the backend candidate excludes frontend pages, components, styles,
   browser hooks, and app-specific UI adapters.
3. Run the backend extraction dry-run against a materialized temp tree.
4. Run the backend source-boundary verifier against the materialized backend
   candidate, not only the current monorepo.
5. Add or update tests for forbidden frontend imports in backend candidate
   source.
6. Update SDK and frontend phases if backend API shape, env requirements, or
   package ownership changes.

## Review Gates

Spec reviewer rejects when:

- backend proof only scans the monorepo and not the generated candidate;
- backend candidate includes frontend source;
- database, migration, auth, tenant, idempotency, or chat ownership is unclear.

Quality reviewer rejects when:

- checks depend on local path assumptions that a new repo will not have;
- generated package metadata is not validated;
- docs overstate deployability before live proof exists.

## Acceptance Criteria

- Backend candidate can be materialized in a temp directory.
- Candidate-local boundary checks pass.
- Candidate metadata includes backend-only scripts for future repo bootstrap.
