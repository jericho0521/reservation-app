# Phase 5: Live Backend Platform Proof

## Goal

Prove the backend product repo can run as a standalone platform service against
real disposable infrastructure. Safe readiness checks can prepare the proof, but
strict live checks are required before release.

## Inputs To Read

- Phase 1 backend product contract from this folder
- Phase 4 clean external frontend proof from this folder
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-10-live-platform-proof.md`
- `scripts/verify-live-platform-proof-readiness.mjs`
- `scripts/verify-standalone-backend-live-proof.mjs`
- `scripts/verify-database-live-proof.mjs`
- `scripts/verify-sdk-live-parity.mjs`

## Work

1. Stand up or target a standalone backend service that exposes `/v1`.
2. Apply package-owned migrations to a disposable database.
3. Prove health, catalog, availability, reservation create/read/update/cancel,
   resource maintenance, auth/tenant enforcement, RLS/tenant isolation,
   durable idempotency, and chat-disabled behavior.
4. Prove SDK and direct HTTP parity against the same live backend URL.
5. Record all required env, setup steps, teardown steps, and failure modes.

## Acceptance Gates

- `corepack pnpm run backend-platform:live-proof-readiness` passes.
- `corepack pnpm run backend-platform:live-proof:strict` passes against a real
  standalone backend URL.
- `corepack pnpm run database:live-proof:strict` passes against a disposable
  database.
- `corepack pnpm run sdk:live-parity:strict` passes against the same backend.
- Skipped, unconfigured, or mock-only checks are not counted as release proof.

## Downstream Update Rule

If live proof changes required env, deployment assumptions, CORS/auth policy,
database migration behavior, idempotency guarantees, SDK parity expectations, or
chat support status, update Phase 6 and any backend/SDK/frontend consumer docs
before reporting done.

## Subagent Notes

Do not treat local fake repositories, safe skips, or generated metadata checks
as live platform proof. They are prerequisites only. This phase is about the
backend behaving like a real service other repositories can consume.
