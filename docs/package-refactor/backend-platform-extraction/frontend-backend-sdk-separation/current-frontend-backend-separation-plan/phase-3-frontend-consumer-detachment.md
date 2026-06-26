# Phase 3: Frontend Consumer Detachment

## Goal

Turn the current frontend into one replaceable consumer of the backend product.
The frontend should own UI, navigation, forms, admin screens, and chat UI while
calling the backend through the SDK or direct `/v1` HTTP compatibility layer.

## Inputs To Read

- `phase-0-current-separation-baseline.md`
- `phase-1-backend-product-boundary.md`
- `phase-2-sdk-install-contract.md`
- `../phase-26-frontend-consumer-detachment.md`
- `../frontend-consumer-repo-inventory.json`
- `lib/reservation-platform-client.ts`
- `lib/reservation-chat-client.ts`
- `app`
- `components`

## Work

1. Expand or correct the frontend consumer inventory so included source can
   build outside the backend repository.
2. Remove direct frontend imports of backend services, database adapters,
   route handlers, provider workflows, service-role config, and backend package
   internals.
3. Route platform-mode frontend calls through the SDK or public `/v1` HTTP
   wrappers.
4. Keep AI chat UI in the frontend, but keep LangChain/provider workflow logic
   in the backend product boundary.
5. Record each remaining `/api` dependency as compatibility-only with an owning
   removal or deprecation decision.

## Proof Commands

- `corepack pnpm run current-frontend:boundary`
- `corepack pnpm run current-frontend:consumer-repo-readiness`
- `corepack pnpm run current-frontend:consumer-install-proof`
- `corepack pnpm run current-frontend:consumer-install-proof:strict` when a
  prepared frontend workspace exists outside the repo.
- `corepack pnpm run current-frontend:platform-smoke`
- `corepack pnpm run current-frontend:admin-platform-smoke`

Default readiness commands are safe local scans. Strict install and smoke
commands should run only against disposable prepared workspaces and known
backend targets.

## Done When

- Current frontend source can be materialized as a consumer workspace without
  backend implementation source.
- Platform-mode frontend calls target an external backend base URL.
- Chat UI does not own backend AI workflow execution.
- Compatibility route usage is fully inventoried.

## Downstream Updates

If frontend source ownership, env names, smoke flows, admin/form/chat behavior,
or `/api` dependencies change, update Phases 4 and 5.
