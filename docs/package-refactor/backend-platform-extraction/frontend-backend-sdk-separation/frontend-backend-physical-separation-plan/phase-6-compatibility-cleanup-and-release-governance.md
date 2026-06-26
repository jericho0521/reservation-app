# Phase 6: Compatibility Cleanup and Release Governance

## Goal

Remove or formally govern temporary compatibility paths after the backend repo,
SDK artifact, frontend candidate, live backend proof, and external adoption proof
have passed.

## Inputs To Read

- Phases 0-5 from this folder
- `../phase-9-compatibility-route-removal.md`
- `../compatibility-route-removal-decision-log.md`
- `../remaining-modularity-gaps.md`
- release/versioning docs
- rollback/deprecation docs

## Worker Tasks

1. Classify each compatibility route as removable, temporarily retained, or
   blocked by missing backend/SDK/frontend proof.
2. Remove routes only when Phase 5 proves external consumers do not need them.
3. Document deprecation windows for retained compatibility adapters.
4. Define release gates for backend repo, SDK package, and frontend consumer
   repo.
5. Add CI checks that prevent reintroducing backend imports into frontend code or
   frontend imports into backend product code.
6. Update `../remaining-modularity-gaps.md` with final status and evidence.

## Proof Commands

- `corepack pnpm run backend-platform:verify-compatibility-route-removal-gate`
- `corepack pnpm run backend-platform:live-proof-readiness`
- `corepack pnpm run sdk:registry-install-proof`
- `corepack pnpm run current-frontend:consumer-repo-readiness`

These are safe release-gate commands in default readiness mode. Removal itself
must be reviewed carefully because it changes compatibility behavior.

## Acceptance Criteria

- Compatibility route decisions are evidence-backed.
- Release governance states which repo owns which release gate.
- New frontend projects can integrate through backend URL plus SDK artifact.
- Remaining compatibility adapters have owners, deadlines, and rollback notes.
