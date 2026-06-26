# Phase 1: Backend Product Boundary Closure

## Goal

Close the backend side of the split so the backend product can be materialized,
installed, tested, and run without frontend source or current-app compatibility
route ownership.

## Inputs To Read

- `README.md`
- `phase-0-current-separation-status-audit.md`
- `../phase-1-backend-module-boundary-results.md`
- `../phase-4-auth-tenant-runtime-config-split-results.md`
- `../phase-5-ai-chat-workflow-split-results.md`
- `../phase-7-standalone-backend-cutover.md`
- `../phase-10-live-platform-proof.md`
- `../phase-11-backend-repo-extraction.md`
- `../../backend-repo-bootstrap.md`
- `../../backend-package-ownership.md`

## Work

1. Make backend package ownership explicit for `/v1` API handlers, domain
   services, storage adapters, migrations, RLS, idempotency, auth/tenant
   enforcement, and optional AI chat workflows.
2. Ensure backend-owned code does not import frontend pages, components,
   browser helpers, current frontend wrappers, or compatibility-only route
   files.
3. Ensure backend candidate materialization includes the files and root scripts
   required to install, build, test, run, and verify its own source boundary.
4. Document which compatibility route files remain current-repo adapters and
   must not be copied as canonical backend product code.
5. Update SDK and frontend phases if backend API shape, auth headers, runtime
   env, or chat behavior changes.

## Deliverables

- Updated backend ownership docs or extraction manifest if ownership changes.
- Updated backend candidate proof docs describing safe readiness versus strict
  install/build/test proof.
- Updated later phases for any changed backend contract.

## Acceptance Criteria

- Backend product code can be identified without reading chat history.
- Backend candidate proof is not described as complete unless strict extracted
  install/build/test passes outside this repository.
- No frontend source is required to explain or execute backend product
  ownership.

## Subagent Notes

Spec review should fail if frontend code is added to backend manifests just to
make a proof pass. Quality review should check that strict proof commands are
fail-closed and do not publish or deploy without explicit configuration.
