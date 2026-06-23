# Phase 1: Backend Platform Repo Contract

## Goal

Define the backend as an independently deployable product repository. This repo
owns server behavior, data, workflows, migrations, and operational contracts.

## Inputs To Read

- `phase-0-separation-source-of-truth.md`
- `../phase-11-backend-repo-extraction.md`
- `../phase-13-backend-platform-product-repo.md`
- `../phase-16-physical-backend-repo-split.md`
- `../phase-21-backend-repo-materialization.md`
- `../phase-25-backend-product-repo-contract.md`
- current backend package manifests and extraction scripts

## Write Scope

- backend repository contract docs
- backend package manifest/extraction manifest updates
- backend-only verification scripts
- downstream updates to Phases 2, 3, 4, 5, and 6

## Tasks For Worker Subagent

1. Define the backend repo contents: API handlers, domain services, database
   access, migrations, auth/tenant enforcement, idempotency, chat runtime, and
   deployment docs.
2. Define what must not be copied into the backend repo: frontend pages,
   components, CSS, browser-only hooks, and app-specific UI adapters.
3. Add or update checks that prove backend packages build without importing
   frontend code.
4. Document required environment variables for backend deployments.
5. Document database ownership and migration strategy.
6. Update SDK and frontend phases if backend API shape or runtime assumptions
   change.

## Review Gates

Spec reviewer rejects when:

- backend repo still depends on frontend components or browser-only code;
- backend contract excludes database or workflow ownership;
- deployment requirements are undocumented.

Quality reviewer rejects when:

- extraction checks are only source scans with no package/build proof;
- backend env requirements are mixed with frontend public env requirements;
- database migration ownership remains ambiguous.

## Acceptance Criteria

- Backend can be described as its own repo and service.
- Backend package/build checks prove no frontend dependency.
- Runtime env, database, and workflow ownership are clear.
