# Phase 2: Backend Repo Runtime Proof

## Purpose

Prove the backend can exist as its own product repository and runtime, not just
as packages inside the current Next.js app.

## Inputs To Read

- Phase 0 audit output
- Phase 1 boundary checks
- parent `phase-7-standalone-backend-cutover.md`
- parent `phase-11-backend-repo-extraction.md`
- backend extraction manifest
- `apps/api/**`
- backend-owned packages under `packages/**`
- database migration bundle docs and scripts

## Write Scope

- backend extraction manifest
- backend candidate generation/readiness scripts
- backend package manifests
- backend bootstrap docs
- downstream SDK/frontend proof docs when contracts change

## Non-Goals

- Do not include frontend app files to make backend builds pass.
- Do not copy compatibility route handlers as canonical backend code.
- Do not use live production infrastructure for proof.

## Work Items

1. Generate or materialize a backend-only repository candidate from the
   extraction manifest.
2. Prove the candidate has enough package manager metadata for a clean install.
3. Prove backend build and test commands are candidate-local and do not rely on
   root monorepo scripts that inspect frontend source.
4. Run the standalone backend runtime with fake or disposable adapters where
   possible, and prove `/v1/health` plus representative `/v1` routes.
5. Prove database migration bundle selection and disposable database execution
   when configured.
6. Document required runtime env for auth, tenant enforcement, idempotency,
   database access, and optional AI chat.

## Acceptance Criteria

- Backend candidate excludes current frontend pages/components/routes.
- Backend candidate excludes compatibility-only Next.js route glue.
- Backend candidate install/build/test commands are documented and verifiable.
- Runtime starts without importing current frontend helpers.
- Live disposable database proof is clearly separated from readiness-only proof.
- Missing live env causes a documented skip or strict failure, never a false
  success.

## Subagent Handoff

Give the worker this file, backend extraction manifest, existing extraction
scripts, `apps/api`, backend-owned package manifests, and database proof docs.
Reviewers must reject backend candidates that pass by keeping hidden frontend
dependencies.

