# Phase 1: Backend Product Repository Contract

## Purpose

Define the backend as the product repository, not merely a package inside the
current app. This phase answers: what belongs in the backend repo, what is
published through `/v1`, and what must never be imported by frontend code?

## Inputs To Read

- `phase-0-current-product-boundary-baseline.md`
- `../phase-25-backend-product-repo-contract.md`
- `../backend-product-repo-handoff-plan/phase-1-backend-repository-product-boundary.md`
- `apps/api/package.json`
- `apps/api/deployment.config.json`
- `packages/reservations-core`
- `packages/reservations-supabase`
- `packages/database`
- `packages/ai-chat`

## Write Scope

- backend ownership manifest;
- backend API contract docs;
- backend repo extraction manifest;
- backend-only CI and release gate docs;
- downstream Phase 2, 4, 5, and 6 assumptions.

## Non-Goals

- Do not move UI, route shells, frontend hooks, or browser clients into the
  backend repo.
- Do not expose service-role secrets, provider SDKs, migration internals, or
  LangChain workflows through the SDK.
- Do not keep compatibility routes as canonical backend API.

## Steps

1. Lock the backend repo ownership list: API runtime, domain services, storage
   adapters, migrations, auth, tenant checks, idempotency, optional chat
   workflow, deployment config, and operational docs.
2. Lock excluded paths: frontend app, components, browser clients, UI chat,
   analytics UI, Next.js compatibility routes, and local app auth helpers.
3. Define public `/v1` resources and error/auth/header conventions.
4. Add or update scans that fail when frontend paths enter backend manifests or
   backend internals enter frontend/SDK manifests.
5. Update downstream phase files if ownership or public route shape changes.

## Acceptance Criteria

- A fresh worker can tell what files should be copied to a backend product repo.
- Backend public API is documented separately from implementation internals.
- Frontend and SDK forbidden imports are explicit and testable.
- Later phases use the same ownership list.

## Subagent Handoff Notes

This worker should focus on contracts and boundaries. If implementation changes
are needed, record them as Phase 2 or Phase 4 requirements instead of silently
changing ownership to make a build pass.
