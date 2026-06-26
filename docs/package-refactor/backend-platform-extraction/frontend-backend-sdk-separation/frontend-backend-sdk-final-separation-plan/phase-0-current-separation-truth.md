# Phase 0: Current Separation Truth

## Goal

Create a factual source of truth for what is already separated and what is still
coupled. This phase prevents later workers from treating packaging progress as
full repository separation.

## Inputs To Read

- `../README.md`
- `../remaining-modularity-gaps.md`
- `../phase-7-standalone-backend-cutover.md`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-10-live-platform-proof.md`
- `../phase-11-backend-repo-extraction.md`
- `../phase-12-frontend-repo-consumer-proof.md`
- root `package.json`
- current `packages/**` manifests
- current app route and API route inventory

## Write Scope

- this phase file
- later phase files in this folder when the current truth changes
- `../remaining-modularity-gaps.md` if the gap list changes

## Tasks For Worker Subagent

1. Summarize what is already modular: backend packages, SDK/client package,
   extraction dry-run, frontend consumer readiness, and boundary checks.
2. Summarize what is not fully separated: physical repos, published SDK,
   live backend proof, compatibility routes, and any direct frontend/backend
   source coupling.
3. Classify every remaining gap as backend-owned, SDK-owned, frontend-owned, or
   release/operations-owned.
4. Update Phases 1-5 if the gap list changes.
5. Record exact commands or scans used as evidence.

## Review Gates

Spec reviewer rejects when:

- the doc claims physical repo separation without a real extracted repo proof;
- the doc calls the current package workspace a complete SDK release;
- remaining frontend/backend coupling is omitted.

Quality reviewer rejects when:

- evidence is only narrative and not tied to files or commands;
- ownership language is vague enough that later phases can misinterpret it.

## Acceptance Criteria

- The plan clearly states the current separation status.
- Remaining gaps are mapped to the correct owner.
- Later phases reflect the same assumptions.
