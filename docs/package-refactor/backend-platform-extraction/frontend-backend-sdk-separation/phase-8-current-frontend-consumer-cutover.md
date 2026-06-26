# Phase 8: Current Frontend Consumer Cutover

## Purpose

Make the current Next.js frontend behave like any other consumer frontend. It
should call the backend platform through direct `/v1` HTTP or the SDK, not
through local backend modules or storage adapters.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-0-current-coupling-audit-results.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-2-sdk-boundary-public-client-results.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-3-frontend-api-migration-results.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-7-standalone-backend-cutover.md`
- `lib/reservation-platform-client.ts`
- `app/form-booking/**`
- `app/chat-booking/**`
- `app/admin/**`
- `components/**`

## Write Scope

- frontend client wrappers
- frontend pages/components/loaders
- frontend tests and smoke tests
- this phase result doc, if created
- `remaining-modularity-gaps.md`

## Non-Goals

- Do not add backend business rules to frontend components.
- Do not import storage adapters, database clients, LangChain workflows,
  service-role config, or `apps/api` internals into frontend code.
- Do not delete compatibility routes until Phase 9 gates pass.
- Do not make the SDK require this current frontend.

## Consumer-Only Rule

The frontend may own:

- UI state
- forms and validation hints
- page routing
- display copy
- auth UX
- analytics presentation
- SDK/direct HTTP client configuration

The frontend must not own:

- reservation conflict rules
- resource capacity decisions
- tenant authorization decisions
- idempotency persistence
- database table/RPC names
- AI provider/retrieval/checkpoint orchestration

## Implementation Steps

1. Inventory frontend imports from backend packages, `lib/reservations/**`,
   current API route internals, Supabase data helpers, and LangChain helpers.
2. Route reservation reads and mutations through `lib/reservation-platform-client.ts`
   or the SDK.
3. Make the backend base URL configurable so the frontend can target local
   compatibility routes during migration or a standalone backend after cutover.
4. Replace Supabase row/legacy booking/seat assumptions with public DTOs.
5. Keep host-auth UX behind frontend-owned auth helpers only.
6. Add browser-safe import scans for frontend files.
7. Add smoke tests proving the current frontend can run against a mocked or
   local standalone `/v1` backend.
8. Update Phase 9 if any compatibility route still has no standalone backend
   equivalent.

## Deliverables

- Frontend import replacement map.
- Consumer-only frontend boundary scan.
- Backend base URL configuration doc.
- Current frontend smoke test against `/v1`.
- List of compatibility routes still required after cutover.

## Partial Implementation Result

The current frontend reservation client can now target a configured platform
origin through the browser-safe
`NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL` setting. Platform-mode service,
availability, reservation, admin reservation, and resource-maintenance calls
now use `@reservation-platform/sdk` when that normalized base URL is configured
as an absolute standalone backend origin. An empty value preserves the previous
relative `/api/v1` compatibility behavior through the direct HTTP fallback.
Non-absolute values are not treated as standalone platform origins and also
preserve the compatibility fallback.
Local mode remains on the temporary `/api/*` compatibility routes and ignores
the platform base URL. Server-side admin loading and smoke tests can still pass
an explicit current-frontend `baseUrl` to `listAdminReservations` for
`${baseUrl}/api/v1` compatibility when the public platform base URL is absent.
In platform mode, the public env setting takes precedence because the SSR
`baseUrl` is the current frontend origin during compatibility loading. Explicit
standalone admin callers can pass an absolute `platformBaseUrl` to use the SDK
against `/v1` when the env setting is absent. A CI-safe local proof now covers
configured platform mode in
`lib/reservation-platform-client.test.ts`: services, availability, reservation
create, admin reservation list, resource-maintenance list/save, and reservation
status update are mocked through `fetch`, and the test fails if any configured
platform-mode reservation-platform call uses relative `/api` routes or the
current frontend origin's `/api/v1` compatibility routes. The configured proof
also covers SDK query serialization for standalone calls so it fails if those
paths regress to the older hand-built direct URL branch. The same test file
continues to prove local mode may use `/api` while compatibility routes remain.

This is partial Phase 8 readiness only. It does not remove `app/api`
compatibility routes, complete a full `/v1` standalone backend cutover, provide
live standalone backend proof, or close Phase 9 removal gates.

An additional local frontend consumer repository readiness proof now exists:

- Inventory:
  `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/frontend-consumer-repo-inventory.json`
- Verifier:
  `corepack pnpm run current-frontend:consumer-repo-readiness`
- Unit tests:
  `node --import tsx --test scripts\verify-current-frontend-consumer-repo-readiness.test.mjs`

The inventory is scoped to reservation platform client/wrapper/proof source,
not every current app screen and not a complete runnable frontend app slice. It
classifies the reservation form component closure, the reservation platform
client, the browser-safe chat transport wrapper, public DTO types, admin
reservation data helpers, and the admin reservation loader as `include`;
backend platform, storage, route, migration, and provider areas as `exclude`;
and route shells/navigation/admin UI, full chat UI, content, analytics, broad
admin, landing, and app scaffolding areas as `reference-only` until their
app-owned API and navigation dependencies are separated or intentionally
included in a later frontend repo proof. Root
package dependencies are classified as `frontend-runtime`, `frontend-dev`,
`sdk-consumer`, `backend-only-excluded`, or `current-monorepo-only`. The
verifier is CI-safe and local-only: it validates inventory shape, listed
path/package existence, the minimum browser-safe frontend env contract, and
prevents backend-only packages or paths from being marked as frontend
runtime/include. It also checks that included local source imports are closed
over other `include` entries. The existing browser-safe boundary and secret
scans now derive scan roots from every `include` source area in this inventory
while preserving their broader explicit migrated/admin/platform-smoke reference
targets, so newly included consumer source cannot bypass those checks by only
editing the inventory. The readiness verifier still requires those boundary
commands to remain prerequisite checks:
`current-frontend:verify-platform-boundary` and
`current-frontend:verify-platform-secrets`.

The same safe verifier now also materializes a temporary frontend consumer
target-tree candidate in the OS temp directory from `include` source areas
only. It writes a generated root `package.json` in that OS-temp candidate with
private package metadata, an exact pinned `pnpm@x.y.z` `packageManager` copied
from the source root package metadata, frontend-only root scripts (`typecheck`,
`build`, and `start`) set to plain `tsc --noEmit`, `next build`, and `next start`,
frontend-runtime and SDK-consumer dependencies copied from the current root
package metadata into `dependencies`, except SDK-facing package entries such as
`@reservation-platform/sdk` and `@reservation-platform/contract-types` are
rewritten from current root `workspace:*` specs to deterministic `0.0.0`
placeholders so the candidate metadata represents installable package artifacts
instead of monorepo workspace links. Frontend-dev
dependencies are copied into `devDependencies`. The verifier rejects generated
metadata if the source `packageManager` is missing, blank, whitespace-padded,
not `pnpm`, not exact, or uses a range/latest/workspace-style value. It also
rejects backend-only dependency names/prefixes or inventory entries marked
`backend-only-excluded` or `current-monorepo-only`, and non-portable generated
`dependencies` or `devDependencies` specs using `workspace:`, `file:`, `link:`,
or `portal:` because another frontend repository cannot consume those
monorepo-local spec forms. It now also scans every materialized source import
specifier and verifies that each external package import is declared in the
generated `dependencies` or `devDependencies`, deriving scoped package names as
`@scope/name` and allowing Node built-in module specifiers such as `node:*`.
Type-only imports are included in this generated package metadata
import-closure check. It verifies the generated scripts are present, non-empty,
and free of backend-platform, database, SDK release/registry,
package-workspace, current-frontend proof/smoke, compatibility-route, Supabase,
monorepo verifier, or `pnpm --filter` command fragments. It also verifies
script/dependency coherence for those generated commands: `tsc --noEmit`
requires generated `typescript` metadata, while `next build` and `next start`
require generated `next` metadata in `dependencies` or `devDependencies`. It
also writes a generated root `tsconfig.json` with frontend-safe TypeScript
metadata: DOM and DOM iterable libs, strict/noEmit checking, bundler module
resolution, React JSX,
`@/*` mapped to the candidate root, source includes for `**/*.ts`,
`**/*.tsx`, and `**/*.mts`, and only `node_modules` excluded. The verifier
rejects generated tsconfig metadata that is not an object, lacks
`compilerOptions`, points at `.next`, current backend/server paths, backend
packages, `packages`/`apps` path segments or aliases, `extends`, project
references, composite output settings, `outDir`, `rootDirs`, absolute paths, or
`..` traversal. The path checks normalize Windows-style backslash separators
before applying those blocks. It excludes
generated/install/cache artifacts such as `node_modules`, `.next`, `dist`,
`coverage`, source maps, and TypeScript build info, validates that the copied
tree contains only allowed frontend-consumer paths plus the generated root
metadata, blocks backend/current-app server paths such as `app/api`, `apps`,
`packages`, `lib/langchain`, `lib/reservations`, `lib/supabase-admin.ts`,
`supabase`, and `dist-packages`, rejects monorepo workspace-root metadata such
as `pnpm-workspace.yaml` or `turbo.json` if an inventory include would
materialize it, and rechecks local import closure with `@/` imports remapped
inside the materialized tree. The temp tree is removed by default; setting
`CURRENT_FRONTEND_CONSUMER_KEEP_MATERIALIZED_TREE=1` keeps the OS-temp copy for
debugging without accepting a custom output path.

This is still temporary target-tree and local metadata readiness only. It does
not create a new frontend repository, delete compatibility routes, install or
publish packages, install the generated dependencies, execute the generated
`typecheck`/`build`/`start` scripts, make network calls, run browser checks, or
prove a complete standalone frontend app install/build/run from a separated
repo. The generated `package.json` and `tsconfig.json` therefore prove
deterministic frontend metadata, script/dependency coherence, and
import-closure shape only, not an executed separated install, typecheck, or
build.

Phase 8 now also has a bounded prepared-root install/build proof harness:

- Safe command:
  `corepack pnpm run current-frontend:consumer-install-proof`
- Strict command:
  `corepack pnpm run current-frontend:consumer-install-proof:strict`
- Unit test:
  `node --import tsx --test scripts\verify-current-frontend-consumer-install-build-proof.test.mjs`

The default command is CI-safe and only validates the proof environment plus
prepared-root metadata. It reports `SKIPPED` or `READY` without installing
dependencies, making network calls, publishing packages, executing generated
frontend commands, starting `next start`, opening a browser, or starting a dev
server.
Strict mode fails closed unless `CURRENT_FRONTEND_CONSUMER_PROOF_ROOT` points
to an existing prepared frontend consumer workspace outside this repository,
including after symlink/junction realpath resolution, the workspace contains
`package.json` and `pnpm-lock.yaml`, the generated `typecheck`, `build`, and
`start` scripts are exactly `tsc --noEmit`, `next build`, and `next start`,
`dependencies`, `devDependencies`, `optionalDependencies`, and
`peerDependencies` contain no `workspace:`, `link:`, or `portal:` specs in
registry mode; explicit artifact mode permits only staged SDK and contract
`.tgz` package artifacts under the prepared root `artifacts/` directory and
validates `pnpm.overrides` the same way. `CURRENT_FRONTEND_CONSUMER_PROOF_ALLOW_INSTALL=1`
must be set. When those gates pass, strict mode runs only the static
allowlisted commands
`corepack pnpm install --frozen-lockfile --ignore-scripts`,
`corepack pnpm run typecheck`, and `corepack pnpm run build` inside the
prepared workspace. The install step ignores package and dependency lifecycle
scripts, and the harness intentionally never runs `start`.

This strict proof passed once against
`C:\Users\User\AppData\Local\Temp\current-frontend-consumer-tree-3vrf7e\frontend-consumer`
with SDK and contract tarballs staged as prepared artifacts. This proves the
selected current-frontend consumer slice can install, typecheck, and build
outside the monorepo from package artifacts. It does not prove public/private
registry install, live backend behavior, live browser runtime, full chat UI
extraction, or a complete separated frontend repository.

The form-booking browser smoke now provides a bounded local external-origin
proof for the current frontend. `current-frontend:platform-smoke` starts a
mock standalone reservation platform backend on a separate `127.0.0.1` origin,
starts the Next.js dev server with
`NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL` pointing at that mock backend, and
drives the existing `/form-booking` flow in Chromium. The mock backend serves
only `/v1/services`, `/v1/availability`, and `POST /v1/reservations`, handles
CORS preflight for the browser's custom platform headers, and asserts tenant,
venue, correlation, idempotency, query, and reservation payload details. The
smoke fails if browser reservation-platform calls hit relative `/api`,
current-frontend `/api/v1`, or mock-backend `/api` compatibility paths.

The admin browser smoke now provides the same bounded local external-origin
proof for admin flows. `current-frontend:admin-platform-smoke` starts a mock
standalone reservation platform backend on a separate `127.0.0.1` origin,
starts Next.js with `NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL` pointing at
that mock backend, and drives the existing admin reservation list/search,
complete/cancel/restore, services, and resource-maintenance list/create/end
flows. The mock backend serves only `/v1/reservations`, `/v1/services`, and
`/v1/resource-maintenance` routes, handles CORS preflight for the browser's
custom platform headers, and asserts tenant, venue, correlation, idempotency,
query, route, and payload details. The smoke tracks browser-observed non-OPTIONS
standalone `/v1` calls separately from backend-handled calls and fails if admin
reservation-platform calls hit current-frontend `/api`, current-frontend
`/api/v1`, or mock-backend `/api` compatibility paths.

This remains a local mock proof only. It does not call a live standalone
backend, Supabase, deployment, durable idempotency store, or seeded platform
data, and it does not remove any current compatibility routes.

The DB-backed browser smoke now provides the first real standalone-backend
current-frontend proof for the public booking flow.
`current-frontend:db-backed-platform-smoke:strict` starts from the same
disposable database configuration as the DB-backed standalone parity proof,
applies package-owned migrations, verifies RLS/admin/idempotency database
behavior, starts the standalone `/v1` backend with DB-backed repositories and
frontend-origin CORS, then starts the current frontend on a separate origin in
platform mode and drives `/form-booking` through service selection,
availability, resource selection, and reservation creation. It fails if the
browser uses current-frontend `/api`, standalone-backend `/api`, misses
required tenant/venue/correlation headers, or skips `GET /v1/services`,
`GET /v1/availability`, or `POST /v1/reservations`. This is stronger than the
mock platform smoke but still covers the public booking flow only; admin
DB-backed browser smoke and fully materialized external-frontend browser smoke
remain separate gates if required before route removal.

The DB-backed admin browser smoke now covers the current frontend admin
reservation and resource-maintenance flows against the same class of
standalone backend target. `current-frontend:db-backed-admin-platform-smoke:strict`
starts from the disposable database proof configuration, applies package-owned
migrations, verifies RLS/admin/idempotency database behavior, seeds DB-backed
admin reservation and maintenance fixtures, starts the standalone `/v1` backend
with frontend-origin CORS, then starts the current frontend on a separate
origin in platform mode. It drives `/admin/platform-smoke` through reservation
list, complete, restore, cancel, search, and restore behavior, then drives
`/admin/platform-smoke/maintenance` through service loading,
resource-maintenance list, resource-maintenance create, and
resource-maintenance end behavior. The smoke fails if the browser uses
current-frontend `/api`, standalone-backend `/api`, misses required
tenant/venue/correlation headers, misses idempotency headers on mutations, or
skips required standalone `/v1` calls.

This closes current-frontend DB-backed browser proof for the covered public
booking and admin flows. Fully materialized external-frontend browser smoke,
full chat UI extraction, live enabled chat provider behavior, hosted backend
deployment, and compatibility route cleanup remain separate gates.

The current frontend chat client now has the same browser-safe standalone
backend URL switch for platform chat mode. When
`NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL` is configured as an absolute URL,
`lib/reservation-chat-client.ts` sends platform chat session creation, message,
and confirmation requests to the standalone backend `/v1/chat/...` contract.
The setting may be an origin such as `https://api.example.test` or may already
include `/v1`; the resolver keeps either form on a single `/v1` path. Empty or
non-absolute values preserve the current-app `/api/v1/chat/...` compatibility
fallback, and local chat mode still uses `/api/chat`.

The frontend consumer repository readiness proof now includes only this
browser-safe chat transport wrapper and its legacy response mapping. It still
keeps `app/chat-booking` and `components/chat` as `reference-only` because the
full chat UI closure has not been proven extractable without current-app shell,
backend, or provider dependencies.

This is a bounded local unit proof only. It does not prove live provider-backed
enabled chat, live standalone backend parity, CORS in a deployed browser
environment, durable idempotency persistence, route deletion, or optional chat
module production configuration.

## Acceptance Criteria

- Current frontend reservation flows can use a standalone backend base URL.
- Frontend code does not import backend modules for reservation behavior.
- Browser bundles do not include server-only secrets, Supabase service clients,
  LangChain, provider SDKs, database migrations, or route handlers.
- Public DTOs are used at the frontend boundary.
- Remaining local route usage is documented as temporary compatibility only.

## Subagent Handoff Notes

Give the worker this file plus Phase 3 results and the current frontend import
scan. The worker should not remove compatibility routes; it should leave an
explicit route-by-route status for Phase 9.
