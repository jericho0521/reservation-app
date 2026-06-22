# Phase 1: Backend Module Ownership Lock

## Purpose

Make backend platform modules stand as the owner of business behavior. The
backend should own reservation services, catalog services, availability,
resource maintenance, database repositories, migrations, idempotency,
tenant/auth enforcement, and AI workflow execution.

## Write Scope

- Add or strengthen source-boundary checks that block backend modules from
  importing frontend source, UI components, browser helpers, or current-app
  wrappers.
- Add or strengthen package graph checks that keep backend packages free of
  frontend-only dependencies.
- Ensure `apps/api` is the standalone `/v1` API target and does not depend on
  Next.js route glue.
- Document any behavior still trapped in compatibility routes as a blocker for
  Phase 5.

## Non-Goals

- Do not move frontend source into backend packages.
- Do not put SDK-only consumer helpers inside backend modules.
- Do not treat current Next.js compatibility routes as backend product API.
- Do not require live infrastructure unless the phase adds an explicit strict
  proof command.

## Required Checks

- Backend source scans reject imports from `app/`, `components/`, frontend
  wrappers, browser Supabase helpers, and UI packages.
- Backend package manifests reject React, Next UI-only dependencies, browser
  auth helpers, and workspace-only frontend dependencies.
- `apps/api` health can start without frontend env or Supabase client creation.
- Protected backend routes fail closed before repository work when auth config
  requires it.

## Acceptance Criteria

- The backend platform can be described as a standalone service boundary, not as
  shared frontend internals.
- Every backend-owned package has a clear reason to exist in the eventual
  backend product repository.
- Any remaining backend behavior inside compatibility routes is explicitly
  tracked as a blocker, not ignored.

## Downstream Update Requirement

If backend API paths, auth behavior, repository ports, migration ownership, or
chat workflow ownership change, update Phases 3 through 5 and
`../remaining-modularity-gaps.md`.

