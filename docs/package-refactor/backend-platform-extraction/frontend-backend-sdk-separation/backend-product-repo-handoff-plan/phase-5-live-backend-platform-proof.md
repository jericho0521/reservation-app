# Phase 5: Live Backend Platform Proof

## Goal

Prove the backend product works against configured disposable infrastructure,
including database migrations, RLS/tenant isolation, idempotency, public `/v1`
behavior, SDK parity, and optional chat mode handling.

## Inputs To Read

- `phase-1-backend-repository-product-boundary.md`
- `phase-4-external-app-adoption-proof.md`
- `../phase-10-live-platform-proof.md`
- `../phase-28-live-backend-and-external-consumer-proof.md`
- `../../database-migration-bundle-manifest.json`

## Work Items

1. Define required disposable backend, database, tenant, venue, auth, and seed
   data env.
2. Apply backend-owned migrations to disposable infrastructure.
3. Prove RLS/tenant isolation and service-token/JWT failure behavior.
4. Prove idempotency replay and misuse behavior through live backend routes.
5. Prove SDK/direct HTTP parity against the same standalone `/v1` backend.
6. Prove disabled chat behavior and explicitly separate enabled provider-backed
   chat proof if it is still unsupported.
7. Update Phase 6 and remaining gap docs with exact proof status.

## Acceptance Criteria

- Strict proof passes against disposable live infrastructure.
- Skipped readiness checks are not recorded as release proof.
- Live mutations use throwaway data and document cleanup/rollback.
- Enabled chat is either proven or clearly blocked as unsupported.

## Proof Commands

- `corepack pnpm run database:live-proof:strict`
- `corepack pnpm run backend-platform:live-proof-readiness:strict`
- SDK/direct live parity strict command configured for the same backend target

These commands are only safe when pointed at disposable infrastructure. They may
apply migrations and mutate test data; never run them against production data.

## Reviewer Checklist

- Spec reviewer confirms live proof covers database, auth, tenant, idempotency,
  SDK parity, and chat mode.
- Quality reviewer confirms rollback and cleanup instructions are present.
- Both reviewers reject release claims based only on parser/readiness checks.
