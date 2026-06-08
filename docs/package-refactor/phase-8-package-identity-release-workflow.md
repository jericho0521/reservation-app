# Phase 8: Package Identity and Release Workflow

## Goal

Prepare the reservation packages for real installation outside this repository
by finalizing names, ownership, versioning, provenance, and release automation.

## Why This Phase Exists

The packages are currently private workspace packages. Another app can consume
them inside a monorepo, but cannot install them from a registry. This phase
turns the package boundary into a publishable artifact without forcing an
immediate public release.

## Read First

- `docs/package-refactor/remaining-work.md`
- `docs/package-refactor/handoff-checklist.md`
- `packages/reservations-core/package.json`
- `packages/reservations-core/README.md`
- `packages/reservations-supabase/package.json`
- `packages/reservations-supabase/README.md`
- Root `package.json`
- CI/release workflow files, if present

## Allowed Write Scope

- Package manifests
- Package README files
- Release or changelog docs
- CI/release workflow files
- Root package scripts related to package build, test, pack, or release
- `docs/package-refactor/handoff-checklist.md`
- This phase file
- Later phase docs only when names or install commands change

## Do Not Touch

- Reservation engine behavior
- Supabase SQL behavior
- Host app UI or API behavior

## Work Items

1. Decide final package names or record that names remain intentionally private.
2. Decide registry target: npm public, npm private, GitHub Packages, or internal
   tarball distribution.
3. Decide ownership and publish permissions.
4. Add package metadata such as description, license, repository, keywords, and
   author/maintainer fields as appropriate.
5. Add `prepack` or release scripts that build declarations before packaging.
6. Add `pnpm pack` verification instructions.
7. Verify the Supabase package tarball includes
   `sql/create-reservation-atomic.sql` because production booking safety depends
   on the host installing that RPC asset.
8. Add changelog/release note expectations.
9. Decide whether `private: true` remains or is removed.
10. Update install examples in downstream docs.

## Deliverables

- Final package identity decision: deferred. Keep
  `@project-play/reservations-core` and
  `@project-play/reservations-supabase` as private temporary workspace package
  names.
- Registry target: internal tarball distribution from this repository. npm
  public, npm private, and GitHub Packages are deferred.
- Release workflow documentation:
  [`release-workflow.md`](release-workflow.md).
- Package metadata suitable for internal tarball distribution.
- Updated install commands for external consumers: generate artifacts with
  `pnpm packages:pack`, then install tarballs from `dist-packages`.
- Updated handoff checklist.

## Acceptance Criteria

- A maintainer knows exactly how the packages will be distributed.
- `pnpm pack` can produce installable package artifacts.
- Package tarballs include only intended files.
- Publishing remains blocked only by explicit policy, not missing metadata.
- Later phase docs use the chosen package names and install commands.

## Upstream Dependencies

- Depends on Phase 7 if the Supabase adapter will be advertised as
  production-safe. Phase 7 is complete when the release docs preserve the
  requirement to install `create_reservation_atomic(payload jsonb)` from the
  Supabase package SQL assets.

## Downstream Update Requirements

If package names, registry target, or install commands change, update:

- `phase-9-external-consumer-smoke-test.md`
- `phase-10-plugin-host-contract.md`
- Package READMEs
- `docs/package-refactor/remaining-work.md`

## Phase 8 Completion Notes

- Package names remain `@project-play/reservations-core` and
  `@project-play/reservations-supabase`; this is an explicit deferral, not a
  missing decision.
- Distribution target is internal tarballs created from the repository.
- Both package manifests keep `private: true`, `version: 0.0.0`, and
  `license: UNLICENSED` until final identity, registry, license, ownership, and
  publish permissions are approved.
- Package manifests now include description, repository, keywords, and
  maintainer metadata.
- Package `prepack` scripts build declaration output before packaging.
- Root `pnpm packages:pack` creates local tarball artifacts under
  `dist-packages`.
- Release notes must include package names/versions, exact tarball filenames,
  verification results, public API changes, SQL asset changes, and the live
  Supabase/concurrency verification gap.
- Supabase package tarballs must include `sql/create-reservation-atomic.sql`;
  production consumers must apply it before relying on atomic Supabase booking
  creation.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Package names and registry target
- Publishing status
- Downstream updates required
