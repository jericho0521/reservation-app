# Reservation Package Release Workflow

This document records the Phase 8 package identity and distribution decision.
It is a how-to guide for maintainers preparing installable package artifacts
without publishing them to a registry.

## Current Distribution Decision

- Package names remain `@project-play/reservations-core` and
  `@project-play/reservations-supabase`.
- The names are temporary workspace identities, not approved public registry
  names.
- Registry target is internal tarball distribution from this repository.
- npm public, npm private, and GitHub Packages publishing are deferred.
- Both package manifests keep `private: true`.
- Package license metadata is `UNLICENSED` until ownership approves a public or
  private registry release policy.
- Publish permission belongs to the Project Play maintainers. No automation is
  allowed to publish these packages while `private: true` remains.

## Versioning

Keep both packages at `0.0.0` while distribution is tarball-only and identities
are deferred. Before any registry publish, maintainers must:

1. Approve final package names.
2. Choose the registry target.
3. Confirm ownership and publish permissions.
4. Replace `UNLICENSED` if a distributable license is approved.
5. Remove `private: true` only after the publish target and access level are
   explicitly approved.
6. Set the first semantic version, usually `0.1.0` for an initial prerelease or
   `1.0.0` only if the public contract is considered stable.

After publishing is approved, use semantic versioning:

- Patch: bug fixes with no public API, SQL, or repository contract change.
- Minor: compatible new exports, helpers, examples, or documented SQL support.
- Major: breaking type, validation, repository, package export, or database
  setup contract changes.

## Build and Pack

Run from the repository root:

```powershell
pnpm packages:pack
```

This is safe to run in the current workspace. It builds declaration output
through each package `prepack` script, creates local tarballs under
`dist-packages`, and does not publish, push, or modify production data.

Equivalent package-level checks:

```powershell
pnpm --filter @project-play/reservations-core pack --pack-destination dist-packages
pnpm --filter @project-play/reservations-supabase pack --pack-destination dist-packages
```

These are safe to run in the current workspace for the same reason: they only
create local package archives.

Expected artifacts:

- `dist-packages/project-play-reservations-core-0.0.0.tgz`
- `dist-packages/project-play-reservations-supabase-0.0.0.tgz`

## Tarball Contents

The core package tarball should contain only:

- `dist/**`
- `README.md`
- `package.json`

The Supabase package tarball should contain only:

- `dist/**`
- `README.md`
- `package.json`
- `sql/**`

Before handing tarballs to an external consumer, inspect the pack output and
confirm the Supabase tarball includes:

- `sql/README.md`
- `sql/create-reservation-atomic.sql`

Production Supabase consumers must apply `sql/create-reservation-atomic.sql`
before relying on atomic booking creation. The installed RPC must be
`public.create_reservation_atomic(payload jsonb)` and its execute grant should
remain service-role only.

## Internal Consumer Install

After generating tarballs, an external test app can install them with local file
paths:

```powershell
pnpm add C:\path\to\reservation-app\dist-packages\project-play-reservations-core-0.0.0.tgz
pnpm add C:\path\to\reservation-app\dist-packages\project-play-reservations-supabase-0.0.0.tgz
```

These commands are safe for a disposable external consumer project. They modify
that consumer project's `package.json` and lockfile, but they do not publish or
change this repository.

The Supabase adapter tarball depends on the core package name. Install the core
tarball first, then the Supabase tarball.

## Release Notes

For tarball handoffs, create release notes in the pull request or repository
release notes before sharing artifacts. Include:

- Package names and versions.
- Exact tarball filenames.
- Verification commands and results.
- Public API changes.
- SQL asset changes, especially RPC signature or grant changes.
- Known validation gaps, including the unresolved live Supabase/concurrency
  verification gap.
- Migration instructions for external consumers.

Do not tag or publish a registry release until final identity, registry,
license, ownership, and publish permissions are approved.
