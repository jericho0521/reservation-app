# Phase 30: Package Source and Frontend Proof

## Purpose

Unblock the external frontend proof by making the SDK and contract packages
installable from an approved package source instead of relying on monorepo
workspace links.

This phase answers: can a frontend directory that starts outside this
repository install the SDK and contract packages with normal package manager
resolution?

## Current Evidence

- Backend prepared-root strict proof has passed once against an external
  extracted backend root.
- Frontend prepared-root proof initially blocked before strict proof because
  `@reservation-platform/contract-types@0.0.0` was not available from npm.
- A prepared-artifact frontend strict proof has now passed with SDK and
  contract tarballs staged under the external proof root. Registry install
  proof remains incomplete.
- Workspace, `file:`, `link:`, and `portal:` dependency specs must not count
  as plug-and-play proof.

## Inputs To Read

- `external-separation-proof-results.md`
- `phase-12-frontend-repo-consumer-proof.md`
- `phase-14-sdk-release-consumer-contract.md`
- `phase-18-sdk-distribution-and-contract.md`
- `phase-22-frontend-repo-materialization.md`
- `phase-23-sdk-package-materialization.md`
- `phase-27-sdk-public-release-surface.md`
- SDK package manifests and pack scripts
- current frontend consumer install proof scripts

## Write Scope

- SDK and contract package source decision doc
- frontend prepared-root proof setup
- package metadata or artifact generator fixes
- strict frontend install/typecheck/build proof result
- downstream phase updates when package names, versions, or install source
  change

## Non-Goals

- Do not publish to a public registry without explicit approval.
- Do not weaken the proof by allowing workspace, `file:`, `link`, or `portal`
  dependencies in the frontend proof package manifest.
- Do not count a local monorepo build as external frontend proof.
- Do not hide package resolution failures behind committed lockfiles that
  cannot be regenerated in a clean consumer.

## Package Source Options

Choose one source and document why:

- Private npm registry or GitHub Packages for pre-release packages.
- Disposable local registry such as Verdaccio for proof-only package
  publication.
- Generated tarball artifacts copied into the proof workspace only if package
  specs and lockfile behavior still model a real installable artifact.

## Implementation Steps

1. Decide the registry proof package source for `@reservation-platform/sdk` and
   `@reservation-platform/contract-types`.
2. Ensure both packages have valid package metadata, exports, types, bundled
   files, and version compatibility.
3. Publish or stage the packages to the approved registry-like proof source.
4. Regenerate the external frontend proof workspace from scratch.
5. Generate its lockfile without monorepo workspace references.
6. Run `current-frontend:consumer-install-proof:strict`.
7. Run `sdk:registry-install-proof:strict` when registry access is available.
8. Record the exact package source, versions, proof root, commands, and result
   in `external-separation-proof-results.md`.
9. Update Phases 31 through 35 if package names, versions, registry mode, or
   install requirements change.

## Acceptance Criteria

- A clean frontend proof root installs SDK and contract packages without
  monorepo workspace links.
- The frontend proof root can typecheck and build against the SDK public
  surface.
- The proof can be repeated from the documented package source.
- Any registry credentials or tokens remain outside the repository.
- Later phases reference the actual package source decision instead of assuming
  npm availability.

## Subagent Handoff Notes

Give the worker this file, `external-separation-proof-results.md`, and the SDK
package manifests. The worker must report package-source tradeoffs before
publishing anywhere. If publication access is unavailable, it should prepare a
repeatable disposable-registry proof path and leave public registry release
incomplete.
