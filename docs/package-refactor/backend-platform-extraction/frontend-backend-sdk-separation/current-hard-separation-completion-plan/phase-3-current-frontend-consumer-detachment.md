# Phase 3: Current Frontend Consumer Detachment

## Goal

Make the current Next.js frontend behave like a normal external consumer. It
may keep its UI, routes, admin screens, analytics, and chat screens, but it must
not own backend logic or require in-repo backend modules to run supported
platform flows.

## Inputs To Read

- `README.md`
- `phase-0-separation-baseline-lock.md`
- `phase-1-backend-product-boundary-closure.md`
- `phase-2-sdk-install-contract-closure.md`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-12-frontend-repo-consumer-proof.md`
- `../phase-17-physical-frontend-repo-split.md`
- `../phase-22-frontend-repo-materialization.md`
- `../phase-26-frontend-consumer-detachment.md`
- `../frontend-consumer-repo-inventory.json`
- `../compatibility-route-inventory.json`

## Work

1. Keep frontend runtime code on the SDK or browser-safe platform client
   wrapper.
2. Remove or classify any frontend import of backend packages, server-only
   Supabase helpers, route handlers, migrations, storage adapters, or AI
   workflow internals.
3. Prove public booking, admin reservation, resource-maintenance, and chat
   transport flows can target a standalone `/v1` backend origin.
4. Materialize the frontend consumer candidate outside the current repo and
   prove install/typecheck/build when strict inputs are available.
5. Record any remaining `/api` use as compatibility fallback, not as the
   product path.
6. Update Phase 5 if compatibility-route blockers change.

## Commands

- `corepack pnpm run current-frontend:boundary`
- `corepack pnpm run current-frontend:consumer-repo-readiness`
- `corepack pnpm run current-frontend:consumer-install-proof`
- `corepack pnpm run current-frontend:consumer-install-proof:strict`
- `corepack pnpm run current-frontend:platform-smoke`
- `corepack pnpm run current-frontend:admin-platform-smoke`
- `corepack pnpm run current-frontend:db-backed-platform-smoke:strict`
- `corepack pnpm run current-frontend:db-backed-admin-platform-smoke:strict`

## Acceptance Criteria

- Frontend source selected for consumer materialization has no backend imports
  or backend-only env requirements.
- Platform-mode browser smokes fail if the current frontend calls its own
  `/api` or `/api/v1` compatibility routes for covered flows.
- Strict consumer install/typecheck/build proof passes from an external root
  using installable SDK and contract package specs.
- Remaining local compatibility paths are documented with owner, reason,
  removal condition, and rollback status.

## Subagent Output

Report:

- frontend paths included and excluded;
- smoke flows covered;
- external-root proof path if used;
- remaining `/api` blockers;
- downstream compatibility docs updated.
