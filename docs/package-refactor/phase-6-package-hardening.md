# Phase 6: Package Hardening

## Goal

Make the workspace packages ready for external publishing later, without publishing them yet.

## Read First

- `docs/package-refactor/phase-6-package-hardening.md`
- `packages/reservations-core/package.json`
- `packages/reservations-supabase/package.json`
- Package source entrypoints
- Package examples and tests
- `docs/package-refactor/example-consumers.md`

## Allowed Write Scope

- Package `package.json` files
- Package README files
- Package tsconfig/build config
- Package tests
- Root package scripts if needed
- `docs/package-refactor/handoff-checklist.md`
- `docs/package-refactor/phase-6-package-hardening.md`

## Do Not Touch

- Host app behavior
- SQL production schema, unless documentation reveals a package setup mismatch
- Earlier phase docs except for explicit corrections

## Work Items

1. Define package `exports`.
2. Define build output and declaration generation.
3. Add package README files.
4. Add versioning and changelog policy.
5. Add publish-readiness checklist.
6. Verify package dependency boundaries.
7. Document remaining blockers, especially atomic booking.

## Deliverables

- Package README files.
- Build/test scripts.
- Handoff checklist updated.
- Publish-readiness notes.
- Completion notes.

## Acceptance Criteria

- Packages are buildable workspace units.
- Public exports are intentionally small.
- Publishing is blocked only by explicit final decisions, not vague missing docs.
- Atomic booking status is clearly documented.

## Upstream Dependencies

- Depends on Phase 5 examples.

## Downstream Update Requirements

This is the final planned phase. Any remaining unresolved blocker must be listed in `handoff-checklist.md`.

## Completion Notes

- Package manifests define root-only `exports`, `main`, `types`, and publish
  `files` entries for later npm readiness.
- Package build scripts now emit `dist` output and declaration files through
  package-local `tsconfig.build.json` files.
- Root scripts include reservation package build and test commands.
- README files document the package APIs, examples, versioning/changelog
  policy, publish readiness, and explicit blockers.
- Publishing remains intentionally blocked by `private: true` until final names,
  ownership, and release workflow are approved.
- Atomic booking remains a blocker for the Supabase adapter until a real
  transaction-safe RPC or equivalent database transaction is implemented.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Package readiness status
- Remaining blockers
- Recommended next step
