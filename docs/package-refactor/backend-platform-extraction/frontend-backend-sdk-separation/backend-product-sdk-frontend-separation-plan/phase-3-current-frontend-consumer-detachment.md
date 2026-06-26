# Phase 3: Current Frontend Consumer Detachment

## Goal

Make the existing frontend behave like a normal external consumer of the
backend product. It should call the SDK or direct `/v1` HTTP through frontend
client wrappers, not import backend modules or depend on local compatibility
routes when a standalone backend URL is configured.

## Inputs To Read

- Phase 0 ownership matrix from this folder
- Phase 2 SDK installable contract from this folder
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/frontend-consumer-repo-inventory.json`
- `lib/reservation-platform-client.ts`
- `lib/reservation-chat-client.ts`
- `scripts/verify-current-frontend-consumer-repo-readiness.mjs`
- `scripts/verify-current-frontend-platform-smoke.mjs`
- `scripts/verify-current-frontend-admin-platform-smoke.mjs`

## Work

1. Expand the frontend consumer inventory until it represents a runnable
   frontend candidate, not only selected wrapper proof files.
2. Route reservation, catalog, resource maintenance, admin, and chat client
   calls through SDK/direct `/v1` behavior when an external backend base URL is
   configured.
3. Preserve local compatibility mode only as an explicit fallback for the
   current app during migration.
4. Block backend-only packages, service-role secrets, migrations, LangChain
   workflows, and current app route internals from frontend source.
5. Record every remaining `/api` dependency as a compatibility blocker.

## Acceptance Gates

- `corepack pnpm run current-frontend:consumer-repo-readiness` passes.
- `corepack pnpm run current-frontend:platform-smoke` passes.
- `corepack pnpm run current-frontend:admin-platform-smoke` passes.
- Configured platform mode fails if the browser calls current frontend `/api`
  or `/api/v1` compatibility routes for platform-owned workflows.
- The generated frontend candidate package metadata has no workspace, backend,
  database, or monorepo-only dependency requirements.

## Downstream Update Rule

If frontend inventory, required SDK methods, platform env names, chat behavior,
or compatibility blockers change, update Phases 4 through 6. If the frontend
needs an API the backend does not expose, update Phase 1 first, then Phase 2.

## Subagent Notes

Do not solve frontend detachment by copying backend services into the frontend.
When a UI needs data or behavior, the answer is a backend `/v1` contract and SDK
method, not a frontend import of backend internals.
