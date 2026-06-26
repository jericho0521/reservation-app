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
- CI-safe extracted backend install/build/test proof harness:
  `corepack pnpm run backend-platform:extracted-install-proof`.
- Approval-gated strict extracted backend install/build/test proof:
  `corepack pnpm run backend-platform:extracted-install-proof:strict`.
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
  move/copy entries into an OS temporary backend target tree candidate, generates
  backend-root workspace metadata there only (`package.json`,
  `pnpm-workspace.yaml`, and a minimal `tsconfig.json`), validates that the
  materialized files stay under backend-allowed prefixes, blocks
  frontend/current-app target areas such as `app`, `components`, `lib`,
  `public`, `types`, `supabase`, `.next`, `node_modules`, and
  `dist-packages`, verifies the generated root metadata is backend-only and not
  a verbatim copy of the current frontend/root manifest, verifies the generated
  root uses pinned pnpm workspace metadata and declares only backend-safe
  candidate-local build/test dev tools (`@types/node`, `tsx`, and
  `typescript`), verifies generated root scripts do not point at absent
  materialized `scripts/*.mjs` verifier files, verifies those generated
  `node scripts/*.mjs` commands do not point at verifier scripts whose default
  repo-relative input docs/manifests are absent from the materialized
  candidate, verifies generated root `corepack pnpm --filter <package-name> run
  <script>` commands match exactly one materialized `apps/*` or `packages/*`
  package manifest and that the referenced package manifest declares the
  requested script, verifies materialized `apps/*` and `packages/*` source
  imports are closed over that package's own dependency metadata, including
  imports of other materialized workspace packages, while allowing Node
  built-ins, runs the backend-candidate source-boundary scan directly against
  the materialized OS-temp tree, verifies expected package manifests exist in
  applicable target package roots, and deletes the temporary tree by default.
- The standalone extraction manifest now includes the backend-owned verifier
  scripts and default input manifest needed by the generated backend root
  source-boundary and database migration-index checks. The generated backend
  root exposes `backend-platform:verify-extraction-boundary` as
  `node scripts/verify-backend-platform-extraction-boundary.mjs --backend-candidate`,
  and `phase-11:verify-generated-backend-workspace` runs that candidate-local
  source scan before package build/test, standalone API skeleton, and database
  migration-index checks. Monorepo-to-candidate extraction, package-graph,
  readiness, and migration-bundle reconciliation guardrails stay as
  current-repository root scripts instead of being exposed as post-extraction
  backend root scripts.
- The standalone extraction manifest now also copies
  `backend-repo-bootstrap.md` and `backend-package-ownership.md` into
  `docs/backend-platform-extraction/` inside the OS-temp backend candidate.
  This proves backend repository bootstrap and ownership guidance is
  materialized with the candidate, while frontend/backend separation planning
  docs such as
  `frontend-backend-sdk-separation/frontend-backend-separation-completion-plan/README.md`
  remain outside the materialized backend tree.
- This phase file now references the actual manifest and verifier script names
  instead of stale `extraction-manifest.json` and
  `extraction-dry-run-plan.json` inputs.
- `backend-platform:extracted-install-proof` now provides the explicit
  install/build/test proof harness for a prepared extracted backend workspace.
  Its default mode validates only the environment contract and generated root
  metadata shape, prints `SKIPPED` or `READY`, and never installs
  dependencies, calls the network, publishes packages, or executes generated
  backend commands in default mode. The strict command fails closed unless
  `RESERVATION_EXTRACTED_BACKEND_PROOF_ROOT` points at an existing prepared
  extracted backend workspace outside the current repository,
  that workspace has `package.json`, `pnpm-lock.yaml`, and the expected
  generated `phase-11:verify-generated-backend-workspace` script, and
  `RESERVATION_EXTRACTED_BACKEND_PROOF_ALLOW_INSTALL=1` is set. When those
  gates are satisfied, the harness runs only two static allowlisted commands
  in that prepared workspace: `corepack pnpm install --frozen-lockfile --ignore-scripts` and
  `corepack pnpm run phase-11:verify-generated-backend-workspace`.
  Install lifecycle scripts are disabled, and the generated backend workspace
  verifier still runs after install.

Exact local command list:

```powershell
corepack pnpm run backend-platform:verify-extraction-manifest
corepack pnpm run backend-platform:verify-extraction-dry-run
corepack pnpm run backend-platform:extracted-install-proof
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
`backend-platform:extracted-install-proof` is safe in this default command list:
without strict mode it validates the proof harness contract and exits after a
`SKIPPED` or `READY` report without running install, network, publish, or
generated backend commands. The strict proof command is separate and runs only
the static allowlisted install plus generated backend workspace verifier.
`backend-platform:verify-extracted-workspace-readiness` is also read-only. It
proves the extracted workspace/package metadata model is coherent enough for
CI-safe planning, including manifest target-path alignment and local workspace
dependency closure.
`backend-platform:verify-extraction-dry-run` now copies only manifest
move/copy candidate files into an OS temporary materialized target tree,
generates backend-root workspace metadata inside that temporary candidate, and
validates that candidate. The generated root `package.json` is backend-only: it
uses the backend repository name, stays private, carries a stable package
manager field, declares the backend-safe root dev tools needed by
candidate-local package build/test scripts (`@types/node`, `tsx`, and
`typescript`), exposes candidate-local package build/test, source-boundary,
standalone API skeleton, and database migration-index checks, and blocks
frontend-only scripts or dependencies such as Next, React, browser smoke
commands, current-frontend checks, and monorepo-only
extraction/readiness/package-graph guardrails. The
generated `pnpm-workspace.yaml` covers `apps/*` and `packages/*`. The dry run
also validates every direct `node scripts/*.mjs` reference in generated backend
root scripts against the materialized target tree and validates known default
input manifests for those generated commands. It also validates generated root
package-filter commands against the materialized candidate package manifests:
each `corepack pnpm --filter <package-name> run <script>` reference must name
exactly one materialized `apps/*` or `packages/*` package, and that package
must declare the requested script. The default generated root now uses that
validation for `packages:build`, `packages:test`,
`backend-platform:verify-extraction-boundary`,
`backend-platform:verify-standalone-api-skeleton`, and the commands reached
through `phase-11:verify-generated-backend-workspace`, plus
`database:migration-index:check` and its
`database-migration-bundle-manifest.json` input. The dry-run also scans
materialized package/app source for literal external import, export, require,
and dynamic import specifiers, derives scoped packages as `@scope/name`, allows
Node built-ins such as `node:path` and `fs/promises`, and fails with
`materialized backend package dependency closure` diagnostics when a source
file imports an external package that is not declared in that package's own
manifest. Imports of other materialized workspace packages must still be
declared by the importing package; workspace presence alone is not sufficient.
Root `package.json` dependencies intentionally do not satisfy this
package-level closure check. The materialized tree now also
contains backend-owned bootstrap and package ownership docs under
`docs/backend-platform-extraction/`, and focused unit coverage proves the
frontend separation completion plan README is not copied into the backend
candidate. Unit coverage also proves the same guard catches the standalone
extraction manifest default path if an extraction verifier command is
reintroduced. The dry-run also imports the reusable boundary verifier and runs
the backend-candidate source scan against the materialized OS-temp candidate,
so copied package source that imports React, Next.js/current-app routes,
frontend components, browser helpers, or frontend-only markers fails the
dry-run with `materialized backend boundary:` diagnostics before the temp tree
is removed. This is still only a local OS-temp generated metadata,
package-level import-closure, root-script/package-script, and source-boundary
readiness proof; it removes the whole temporary tree automatically. It does not
mutate source files, git-tracked paths, or create a real repository, and it
does not copy compatibility-shim or excluded entries. For local
inspection only,
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
- completed strict extracted-repository install/build/test execution outside
  the current Next.js app workspace; the harness now exists and is wired into
  safe and strict release gates, but this is not complete until
  `backend-platform:extracted-install-proof:strict` passes against a real
  prepared extracted backend workspace with explicit install approval
- live deployed `/v1` backend proof
- disposable database migration/RLS/idempotency proof
- strict SDK/direct HTTP live parity proof
- package publication or registry installation proof
