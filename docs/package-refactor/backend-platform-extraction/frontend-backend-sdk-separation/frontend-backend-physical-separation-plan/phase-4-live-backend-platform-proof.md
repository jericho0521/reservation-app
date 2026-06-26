# Phase 4: Live Backend Platform Proof

## Goal

Prove that the backend platform works as a standalone service with real runtime
configuration and a disposable database, not only as local source readiness.

## Inputs To Read

- Phase 1 from this folder
- `../phase-10-live-platform-proof.md`
- `../phase-19-cross-repo-release-proof.md`
- `../phase-28-live-backend-and-external-consumer-proof.md`
- database migration bundle docs and manifests
- standalone backend env/deploy docs
- live proof verifier scripts

## Worker Tasks

1. Define the disposable environment required for live proof: backend URL,
   database URL, Supabase/JWT/service-token settings, tenant/venue seed data,
   and SDK parity credentials.
2. Apply package-owned migrations to a disposable database and prove tenant/RLS,
   idempotency, reservation behavior, and resource behavior.
3. Deploy or run the standalone backend candidate without the current frontend
   host.
4. Run SDK and direct HTTP parity against the same live backend.
5. Record every skipped live check as not complete and update Phases 5-6.

## Proof Commands

- `corepack pnpm run database:live-proof`
- `corepack pnpm run backend-platform:live-proof-readiness`
- `corepack pnpm run backend-platform:live-proof`
- `corepack pnpm run sdk:direct-live-parity`

Default readiness commands are safe because they validate configuration and
local prerequisites. Strict/live commands may connect to external databases or
services and require explicit disposable environment configuration.

## Acceptance Criteria

- Live proof runs against a backend target that is not the current frontend's
  compatibility route host.
- Database migrations apply from the backend-owned bundle.
- Tenant/RLS/idempotency behavior is verified against disposable data.
- SDK/direct HTTP parity passes against the same live backend URL.
