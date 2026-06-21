# Phase 0: Ownership Source of Truth

## Goal

Create the canonical ownership map that decides what belongs to the backend
platform repo, SDK package, frontend consumer repo, compatibility layer, or
reference-only migration history.

## Inputs To Read

- `../README.md`
- `../remaining-modularity-gaps.md`
- `../frontend-consumer-repo-inventory.json`
- `../../standalone-backend-extraction-manifest.json`
- `../../backend-package-ownership.md`
- `apps/api/**`
- `app/**`
- `components/**`
- `lib/**`
- `packages/**`
- root `package.json`
- `pnpm-workspace.yaml`

## Write Scope

- ownership matrix or manifest docs
- backend extraction manifest
- frontend consumer inventory
- local ownership verification scripts
- later phase docs in this folder
- `../remaining-modularity-gaps.md`

## Non-Goals

- Do not move source into a new repository.
- Do not delete compatibility routes.
- Do not publish or install SDK artifacts.
- Do not deploy live infrastructure.

## Implementation Steps

1. Classify every source area as `backend-owned`, `sdk-owned`,
   `frontend-owned`, `shared-contract`, `compatibility-only`, `fixture`, or
   `reference-only`.
2. Reconcile that map with the backend extraction manifest and frontend
   consumer inventory.
3. Add or update a local verifier that rejects conflicting ownership.
4. Explicitly mark generated, install, build, cache, and packaged artifacts as
   excluded unless a phase names them as an artifact to inspect.
5. Update Phases 1-5 when ownership decisions change their work.

## Acceptance Criteria

- A subagent can decide where a file belongs without reading chat history.
- No path is both backend-owned and frontend-owned.
- Compatibility routes are temporary current-app migration support.
- The SDK is identified as an HTTP client and public type surface only.
- The frontend is identified as a consumer of the backend platform.

## Subagent Handoff

Ask the subagent to produce the smallest local proof possible: a manifest,
inventory, or verifier that makes ownership unambiguous. The subagent should
flag unknown files as blockers instead of assigning them to multiple surfaces.
