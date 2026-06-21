# Phase 11: Backend Repository Extraction

## Purpose

Prepare the backend platform to live as its own repository or independently
deployable service, while the current frontend remains only one consumer.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/README.md`
- `docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json`
- `scripts/verify-standalone-backend-extraction-manifest.mjs`
- `scripts/verify-standalone-backend-extraction-dry-run.mjs`
- `docs/package-refactor/backend-platform-extraction/backend-repo-bootstrap.md`
- `docs/package-refactor/backend-platform-extraction/backend-package-ownership.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-7-standalone-backend-cutover.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-10-live-platform-proof.md`
- `apps/api/**`
- backend-owned `packages/**`
- root package/workspace scripts

## Write Scope

- extraction manifest and dry-run plan
- backend repo bootstrap docs
- package/workspace ownership docs
- release gate docs
- this phase result doc, if created
- `remaining-modularity-gaps.md`

## Non-Goals

- Do not copy current frontend app code into the backend repo.
- Do not copy compatibility `app/api/**` route files as canonical backend code.
- Do not include local `.next`, cache, install artifacts, generated tarballs, or
  frontend-only assets.
- Do not make the SDK depend on unpublished workspace internals after
  extraction.

## Target Repository Shape

```text
reservation-platform-backend/
  apps/api/
  packages/api/
  packages/contract-types/
  packages/database/
  packages/domain/
  packages/adapter-supabase/
  packages/ai-chat/
  packages/sdk/
  docs/
  scripts/
```

The exact names can change, but ownership cannot: frontend UI code stays out of
the backend platform repository.

## Implementation Steps

1. Update the extraction manifest with only backend-owned files and packages.
2. Keep compatibility shims as reference-only migration context, not canonical
   copied backend code.
3. Verify package export maps, dependency metadata, and scripts work without the
   current frontend workspace.
4. Add bootstrap docs for installing, configuring, testing, and deploying the
   backend repository.
5. Add SDK consumer docs that target the extracted backend API URL.
6. Run extraction dry-run and boundary scans.
7. Update release artifacts to describe what is backend platform, SDK, optional
   module, and excluded frontend app.

## Deliverables

- Updated standalone backend extraction manifest, when package ownership changes.
- Read-only extraction manifest verifier command:
  `corepack pnpm run backend-platform:verify-extraction-manifest`.
- CI-safe extraction dry-run verifier command:
  `corepack pnpm run backend-platform:verify-extraction-dry-run`.
- Read-only extracted workspace metadata/readiness verifier command:
  `corepack pnpm run backend-platform:verify-extracted-workspace-readiness`.
- Backend repo bootstrap guide.
- Backend-only package ownership table.
- Post-extraction verification command list.
- Consumer integration guide pointing at deployed `/v1`.

## Acceptance Criteria

- Extraction dry-run contains no frontend app code.
- Extracted backend package graph can build/test without current Next.js app.
- SDK remains HTTP-only and installable by external frontends.
- Current frontend can consume the extracted backend using only config and SDK
  or direct HTTP.
- `remaining-modularity-gaps.md` distinguishes true leftovers from completed
  repo-boundary work.

## Subagent Handoff Notes

Give the worker this file plus
`standalone-backend-extraction-manifest.json`,
`backend-repo-bootstrap.md`, `backend-package-ownership.md`, and the two
standalone extraction verifier scripts. The worker must update Phase 7, Phase
8, and Phase 10 if repo extraction exposes a missing runtime, consumer, or live
proof requirement.

## Partial Implementation Result

Phase 11 is partially implemented as readiness documentation and CI-safe
guardrails. No source files were moved, deleted, or published, no git-tracked
target files were created, and no separate backend repository was created. The
extraction dry-run does create a disposable OS temporary target tree candidate
and removes it by default.

Implemented artifacts:

- `docs/package-refactor/backend-platform-extraction/backend-repo-bootstrap.md`
  documents backend repository install, build/test, runtime env, database
  proof, live proof, SDK consumer integration, and excluded current-frontend
  source areas.
- `docs/package-refactor/backend-platform-extraction/backend-package-ownership.md`
  maps `apps/api` and backend-owned package candidates to planned backend
  paths, readiness status, visibility intent, consumer-safety, and excluded
  frontend concerns.
- `backend-platform:verify-package-graph-boundary` now locally checks the
  Phase 11 backend package/app manifest inventory, blocks frontend-only
  dependencies from backend-owned package manifests, and keeps the SDK manifest
  limited to consumer-safe HTTP-only dependencies.
- `backend-platform:verify-extracted-workspace-readiness` now locally models
  the extracted backend repository workspace from the extraction manifest and
  current package manifests. It validates expected extracted package manifests,
  planned package-root renames such as `packages/reservation-platform-api` to
  `packages/api` and `packages/reservations-core` to `packages/domain`, local
  workspace dependency resolution among extracted packages, root/package script
  claims used by bootstrap and release gates, frontend/current-app source
  exclusion, and SDK consumer-safety.
- `backend-platform:verify-extraction-dry-run` now materializes the planned
  move/copy entries into an OS temporary backend target tree candidate, validates
  that the materialized files stay under backend-allowed prefixes, blocks
  frontend/current-app target areas such as `app`, `components`, `lib`,
  `public`, `types`, `supabase`, `.next`, `node_modules`, and
  `dist-packages`, verifies expected package manifests exist in applicable
  target package roots, and deletes the temporary tree by default.
- This phase file now references the actual manifest and verifier script names
  instead of stale `extraction-manifest.json` and
  `extraction-dry-run-plan.json` inputs.

Exact local command list:

```powershell
corepack pnpm run backend-platform:verify-extraction-manifest
corepack pnpm run backend-platform:verify-extraction-dry-run
corepack pnpm run backend-platform:verify-package-graph-boundary
corepack pnpm run backend-platform:verify-extracted-workspace-readiness
corepack pnpm run backend-platform:verify-standalone-api-skeleton
corepack pnpm run backend-platform:verify-standalone-deployment-config
corepack pnpm run database:verify-migration-bundle
corepack pnpm run database:live-proof
corepack pnpm run backend-platform:live-proof-readiness
git diff --check
```

These commands are safe in the current repository. They are local build, test,
type-check, manifest, package-graph, dry-run, migration-bundle, and readiness
checks, except for `database:live-proof`.
`backend-platform:verify-package-graph-boundary` reads package manifests only;
it does not install, publish, copy files, or create a repository.
`backend-platform:verify-extracted-workspace-readiness` is also read-only. It
proves the extracted workspace/package metadata model is coherent enough for
CI-safe planning, including manifest target-path alignment and local workspace
dependency closure.
`backend-platform:verify-extraction-dry-run` now copies only manifest
move/copy candidate files into an OS temporary materialized target tree,
validates that candidate, and removes it automatically. It does not mutate
source files, git-tracked paths, or create a real repository, and it does not
copy compatibility-shim or excluded entries. For local inspection only,
`STANDALONE_BACKEND_EXTRACTION_KEEP_MATERIALIZED_TREE=1` keeps the generated
OS temp directory after the run; this is a boolean debug option, not a custom
path, so it cannot point inside the repository. The verifier still does not
install dependencies, run a clean extracted-repository build/test, publish
packages, deploy a backend, call the network, or connect to a database.
`database:verify-migration-bundle` is the read-only database bundle check.
`database:live-proof` skips when
`RESERVATION_DATABASE_LIVE_URL` or `psql` is not configured, but when they are
configured, even without `--strict`, it connects to the target PostgreSQL
database and applies the package migration plan through `psql`. The strict
variant remains the required CI/live-proof form, but both strict and non-strict
database live-proof commands must point only at disposable infrastructure. None
of these commands create a repository, copy files, publish packages, or deploy
a service.

Still not complete:

- actual standalone repository creation
- final backend package renaming and visibility decisions
- actual extracted-repository install/build/test execution outside the current
  Next.js app workspace; the dry-run now materializes and validates a temporary
  target tree candidate only
- live deployed `/v1` backend proof
- disposable database migration/RLS/idempotency proof
- strict SDK/direct HTTP live parity proof
- package publication or registry installation proof
