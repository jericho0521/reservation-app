# Backend Package Ownership

This table is the Phase 11 ownership map for the planned
`reservation-platform-backend` repository. It documents extraction readiness
only; it does not publish packages or create a separate repository.

| Current path | Current package | Planned backend path | Status | Visibility intent | Consumer-safe? | Excluded frontend concerns |
| --- | --- | --- | --- | --- | --- | --- |
| `apps/api` | `@reservation-platform/standalone-api-skeleton` | `apps/api` | Move candidate; partial extraction proof | Private backend app | No. Hosts deploy it; consumers call `/v1`. | No Next.js app routes, React UI, browser Supabase helpers, current frontend wrapper, or compatibility `app/api/**` files as canonical source. |
| `packages/reservation-platform-api` | `@reservation-platform/api` | `packages/api` | Move candidate; partial extraction proof | Private or internal backend package unless a later product phase exposes stable server APIs | No for frontends. Backend hosts and backend packages may import it. | No frontend components, Next pages/layouts, browser globals, SDK request wrapper, provider SDKs, or current-app route glue. |
| `packages/reservations-core` | `@project-play/reservations-core` | `packages/domain` | Move candidate; ready for extraction planning | Private backend domain package unless later renamed and published as server-only | No for browser consumers. Domain behavior is exposed through `/v1` and SDK. | No UI labels/flows, frontend state, current app auth helpers, or direct consumer app imports. |
| `packages/reservations-supabase/src` | `@project-play/reservations-supabase` | `packages/adapter-supabase/src` | Move candidate; requires reconciliation and naming cleanup | Private backend storage adapter | No. It uses backend/server data access. | No browser Supabase helpers, frontend anon-client factories, UI assumptions, or direct SDK dependency. |
| `packages/reservations-supabase/README.md` and `packages/reservations-supabase/examples` | `@project-play/reservations-supabase` | `packages/adapter-supabase/README.md` and adapter fixtures | Copy/move candidates; requires generalization | Private backend adapter docs/fixtures | No. Documentation may explain server setup only. | No Project Play frontend setup as required backend behavior. |
| `packages/reservations-supabase/sql` | `@project-play/reservations-supabase` | `packages/database/migrations/supabase/package-reservations-supabase` | Compatibility/reference only | Reconciliation input | No | Do not copy verbatim as an additional extracted package path; reconcile into `@reservation-platform/database`. |
| `packages/database` | `@reservation-platform/database` | `packages/database` | Move candidate; partial extraction proof | Private backend database bundle package | No. It is an operations/migration package. | No frontend migration helpers, UI seed assumptions, or production data dumps. |
| `packages/ai-chat` | `@reservation-platform/ai-chat` | `packages/ai-chat` | Move candidate; optional backend module | Private backend module unless later split into public contracts | No for browser consumers, except through API/SDK chat contracts. | No frontend chat UI, provider keys in client bundles, LangChain/provider wiring in the SDK, or Project Play prompt copy as a generic contract. |
| `packages/reservation-chat-core` | `@project-play/reservation-chat-core` | `packages/ai-chat` | Compatibility/reference only; requires reimplementation | Migration reference | No | Do not copy verbatim into the backend product. Use only to preserve behavior while building provider-neutral chat services. |
| `packages/contract-types` | `@reservation-platform/contract-types` | `packages/contract-types` | Move candidate; ready for extraction planning | Public contract package candidate | Yes, if exports remain DTO/schema only. | No backend route handlers, storage adapters, service-role auth helpers, or frontend UI. |
| `packages/sdk` | `@reservation-platform/sdk` | `packages/sdk` | Copy candidate; ready for extraction planning | Public consumer package candidate | Yes, if it stays HTTP-only. | No backend internals, migrations, Supabase clients, LangChain/provider SDKs, React/Next requirements, or route handler imports. |
| `docs/package-refactor/backend-platform-extraction/contracts` | Contract docs | `contracts` | Copy candidate; ready for extraction planning | Public/reference docs | Yes | No current-app UI or frontend deployment instructions as backend requirements. |
| `docs/package-refactor/backend-platform-extraction/backend-repo-bootstrap.md` and `docs/package-refactor/backend-platform-extraction/backend-package-ownership.md` | Backend repository ownership docs | `docs/backend-platform-extraction` | Copy candidates; ready for extraction planning | Backend operations/reference docs | No for runtime consumers; yes as backend repository documentation. | No frontend separation planning docs, frontend repo materialization plans, or current-app UI ownership docs. |
| `scripts/vercel-sandbox-supabase.ts`, `scripts/start-local-supabase.ps1`, `scripts/stop-local-supabase.ps1` | Backend operations helpers | `scripts` | Copy candidates; require generalization | Private backend operations scripts | No | No current frontend deployment assumptions or hard-coded Project Play environment naming. |
| `app/api/v1`, legacy reservation `app/api/**`, and `app/api/chat` | Current Next.js compatibility routes | `apps/api/src/routes` or `packages/ai-chat` | Compatibility/reference only | Not included as canonical backend source | No | Reimplement behavior through `apps/api` and backend packages. Do not copy route files verbatim. |

## Excluded Current-Frontend Areas

The standalone backend extraction manifest excludes these areas from backend
move/copy candidates:

- frontend pages and booking UI: `app/page.tsx`, `app/form-booking`,
  `app/chat-booking`, `components/form`, `components/chat`
- admin UI: `app/admin`, `components/admin`
- analytics/reporting: `app/api/analytics-chat`,
  `app/api/analytics-reports`, `components/analytics`,
  `lib/langchain/analytics-agent.ts`, `lib/langchain/sales-report-pipeline.ts`,
  `lib/sales-reports.ts`, `lib/sales-report-extraction.ts`,
  `supabase/sales-reports.sql`
- content/CMS: `app/blog`, `app/updates`, `app/api/blogs`,
  `app/api/updates`, `components/content`, `lib/blogs.ts`,
  `lib/content-posts.ts`, `supabase/blogs.sql`
- frontend auth/client helpers: `lib/supabase.ts`,
  `lib/supabase-admin.ts`, `lib/supabase-browser.ts`,
  `lib/supabase-server.ts`, `lib/reservation-platform-client.ts`
- marketing/shared UI: `components/landing`, `components/shared`,
  `components/ui`, `app/layout.tsx`, `app/globals.css`

Generated and install artifacts are also excluded from any backend extraction
plan: `.next`, `.turbo`, `.cache`, `node_modules`, `dist`, `dist-packages`,
`coverage`, `out`, source maps, and `*.tsbuildinfo`.

## Verification

Run these read-only guardrails from the current repository root:

```powershell
corepack pnpm run backend-platform:verify-extraction-manifest
corepack pnpm run backend-platform:verify-extraction-dry-run
corepack pnpm run backend-platform:verify-package-graph-boundary
corepack pnpm run backend-platform:verify-extracted-workspace-readiness
corepack pnpm run backend-platform:extracted-install-proof
```

These commands are safe locally. The manifest and dry-run checks validate
manifest shape, source existence,
target backend paths, frontend exclusions, compatibility-shim treatment, target
collisions, and generated artifact exclusion. The dry run materializes a
disposable OS-temp backend candidate, including the backend bootstrap and
package ownership docs under `docs/backend-platform-extraction/`, and removes
it by default. It does not create a permanent backend repository. The
package-graph boundary command is also safe locally:
it reads backend-owned package/app `package.json` files, confirms the expected
Phase 11 manifests exist, rejects frontend-only dependencies in backend
packages, and keeps `@reservation-platform/sdk` free of backend-only runtime
dependencies.
The extracted-workspace readiness command is read-only too: it validates the
future backend workspace metadata model against the manifest and current
package manifests, including planned target path renames, required package/root
scripts, extracted workspace dependency closure, frontend/current-app source
exclusions, and SDK consumer-safety. It does not create a repository, copy
files, install dependencies, run an extracted build/test, publish packages,
deploy, or call live services.
`backend-platform:extracted-install-proof` is also safe locally by default. It
validates the prepared-root environment contract and generated root metadata
shape when configured, then reports `SKIPPED` or `READY`; it does not install
dependencies, call the network, publish packages, or run commands from a
generated backend candidate.

Actual extracted install/build/test evidence remains gated by the strict
prepared-root proof:

```powershell
corepack pnpm run backend-platform:extracted-install-proof:strict
```

The strict proof requires `RESERVATION_EXTRACTED_BACKEND_PROOF_ROOT` to point at
a prepared extracted backend workspace outside the current repository and
`RESERVATION_EXTRACTED_BACKEND_PROOF_ALLOW_INSTALL=1` to explicitly allow the
install step. When those requirements are met, it runs only the allowlisted
`corepack pnpm install --frozen-lockfile --ignore-scripts` and
`corepack pnpm run phase-11:verify-generated-backend-workspace` commands in that
prepared workspace. The install disables package and dependency lifecycle
scripts; the generated backend workspace verifier still runs after install. It
should be cited as actual install/build/test evidence
only after it has run successfully against a real prepared extracted backend
workspace.
