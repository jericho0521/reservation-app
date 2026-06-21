# Phase 0: Current Separation Audit

## Purpose

Create an evidence-based answer to whether the current refactor is actually
separated. This phase should not claim completion from package names alone. It
must prove where frontend, backend, SDK, compatibility, and reference-only code
still overlap.

## Inputs To Read

- parent `README.md`
- parent `remaining-modularity-gaps.md`
- parent `frontend-consumer-repo-inventory.json`
- `docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json`
- `docs/package-refactor/backend-platform-extraction/backend-package-ownership.md`
- root `package.json`
- `pnpm-workspace.yaml`
- `app/**`
- `apps/api/**`
- `lib/**`
- `packages/**`
- `scripts/**`

## Write Scope

- this folder's phase files
- parent `remaining-modularity-gaps.md`
- source ownership docs and inventories
- local verifier scripts that only inspect files

## Non-Goals

- Do not move source files in this phase.
- Do not delete compatibility routes.
- Do not publish or deploy anything.
- Do not treat skipped readiness checks as proof.

## Work Items

1. Produce a separation audit table with these categories:
   `backend-owned`, `frontend-owned`, `sdk-owned`, `shared-contract`,
   `compatibility-only`, `reference-only`, and `unknown`.
2. Compare the audit table against the backend extraction manifest and frontend
   consumer inventory.
3. Identify every current frontend import path that still reaches backend-only
   files, database helpers, LangChain/provider code, service-role config, or
   compatibility API routes.
4. Identify every backend package or app manifest that still depends on
   frontend-only libraries, Next.js UI/runtime code, browser helpers, or
   current frontend route glue.
5. Update later phase docs if the audit changes what must be moved, removed, or
   proven.

## Acceptance Criteria

- The repo has a current-state separation answer that a subagent can use
  without chat history.
- Unknown or mixed ownership is recorded as a blocker, not silently assigned to
  multiple repos.
- Later phases point to the exact audit outputs they must satisfy.
- The answer distinguishes "modular in this monorepo" from "usable as a
  separate backend product plus SDK."

## Subagent Handoff

Give the worker this file plus the parent README, remaining gaps index,
frontend inventory, backend extraction manifest, and backend ownership docs.
The worker should update this phase and downstream phases whenever it finds a
new boundary assumption.

