# Phase 2: Deployable Backend Runtime and Database Ownership

## Purpose

Make the backend product runnable as its own service with backend-owned
database behavior. This phase answers: can the backend deploy, connect to its
database, enforce tenant/auth/idempotency rules, and serve `/v1` without the
current frontend runtime?

## Inputs To Read

- `phase-1-backend-product-repository-contract.md`
- `../phase-31-disposable-database-proof.md`
- `../phase-32-standalone-backend-live-proof.md`
- `../phase-5-ai-chat-workflow-split-results.md`
- `apps/api/src`
- `apps/api/deployment.config.json`
- `packages/database/migrations`
- `packages/reservations-supabase`
- standalone backend proof scripts

## Write Scope

- backend runtime env contract;
- production database adapter ownership;
- deployment config and health proof docs;
- AI chat enabled/disabled runtime rules;
- live backend proof evidence;
- downstream Phase 5 and 6 proof assumptions.

## Non-Goals

- Do not deploy to production without explicit approval.
- Do not make the frontend responsible for database migrations or service-role
  access.
- Do not count compatibility `/api` routes as backend runtime proof.
- Do not hide optional chat behavior behind frontend-only LangChain calls.

## Steps

1. Promote required database adapters from proof-only wiring into backend-owned
   runtime wiring if production needs direct PostgreSQL behavior.
2. Verify Supabase-backed runtime and any direct database runtime have clear
   env contracts and secret boundaries.
3. Run disposable database migration/RLS/idempotency proof.
4. Run standalone backend health and route proof against the disposable
   database.
5. Prove auth, tenant, idempotency, and disabled/enabled AI chat behavior.
6. Record redacted evidence and update external proof results.
7. Update Phases 3, 4, 5, and 6 if route behavior, env names, auth, or chat
   behavior changes.

## Acceptance Criteria

- Backend runtime can start outside the current frontend.
- Database migrations and persistence behavior are backend-owned.
- Service-role and provider secrets never enter frontend or SDK artifacts.
- AI chat workflow is backend-owned or explicitly disabled with a stable API
  response.
- The proof target is usable by SDK/direct parity and external frontend smoke.

## Subagent Handoff Notes

This worker may need infrastructure access. If secrets or deployment access are
missing, keep strict checks fail-closed and document the exact missing env or
service rather than downgrading the proof.
