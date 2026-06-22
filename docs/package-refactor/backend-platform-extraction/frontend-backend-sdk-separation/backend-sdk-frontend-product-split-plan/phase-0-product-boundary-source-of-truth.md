# Phase 0: Product Boundary Source of Truth

## Goal

Create the authoritative ownership map for the product split before any worker
moves files or expands packages.

The output should make it impossible for later phases to confuse:

- backend product source;
- SDK/package-registry source;
- frontend consumer source;
- shared public contract source;
- compatibility-only source;
- reference-only migration source.

## Inputs To Read

- `../README.md`
- `../remaining-modularity-gaps.md`
- `../phase-20-separation-source-of-truth.md`
- `../frontend-consumer-repo-inventory.json`
- `../../standalone-backend-extraction-manifest.json`
- `../../backend-package-ownership.md`

## Allowed Edits

- Boundary source-of-truth docs and manifests.
- Plan docs in this folder when downstream assumptions change.
- Verification scripts only if they validate the ownership map without moving
  runtime behavior.

## Required Decisions

- Which paths belong in the backend product repo.
- Which paths belong in the SDK package artifact.
- Which paths belong in a frontend consumer repo.
- Which current files are compatibility adapters and must not be copied into
  product repos as canonical source.
- Which files are reference-only and can inform migration but not ship.

## Acceptance Criteria

- There is a single source-of-truth table or manifest that every later phase can
  cite.
- Backend-owned entries exclude frontend pages, components, browser auth UI,
  analytics UI, and current-app compatibility wrappers.
- Frontend-owned entries exclude backend services, route handlers, database
  adapters, migrations, provider workflows, and service-role configuration.
- SDK-owned entries exclude backend implementation and UI.
- `../remaining-modularity-gaps.md` points this ownership work at this phase or
  an equivalent existing source-of-truth phase.

## Proof Commands

- Run the existing ownership/boundary verification commands if present.
- If a new verifier is added, it must be CI-safe and must not require network,
  registry, deploy, or live database access by default.

## Downstream Updates

Update Phases 1, 2, 3, 5, and 6 in this folder if the ownership map changes
package names, source inclusion rules, or repo boundaries.
