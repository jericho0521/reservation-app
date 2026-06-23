# Phase 6: Cleanup, Release, and Ownership Gates

## Goal

Remove obsolete compatibility paths only after backend, SDK, current frontend,
external frontend, and chat workflow proofs pass.

## Inputs To Read

- all earlier phase files in this folder
- `../remaining-modularity-gaps.md`
- `../compatibility-route-removal-decision-log.md`
- `../compatibility-route-inventory.json`
- `../phase-9-compatibility-route-removal.md`
- `../phase-15-operations-deprecation-release.md`
- current package scripts and CI checks

## Write Scope

- compatibility route removal plan and decision log
- release checklist
- CI/package scripts
- docs for backend, SDK, and frontend ownership
- `../remaining-modularity-gaps.md`

## Tasks For Worker Subagent

1. Verify Phases 0 through 5 have evidence, not only intent.
2. Remove or deprecate compatibility routes only when replacement backend API
   and SDK adoption proof exist.
3. Add release checks for backend build, SDK package install, frontend consumer
   build/readiness, and external adoption proof.
4. Document versioning and release ownership for backend API and SDK package.
5. Update `remaining-modularity-gaps.md` with closed gaps and remaining blockers.
6. Prepare final migration notes for future frontend repos.

## Review Gates

Spec reviewer rejects when:

- compatibility routes are removed before external adoption proof;
- release docs do not explain which repo owns which artifact;
- remaining blockers are deleted instead of resolved or carried forward.

Quality reviewer rejects when:

- CI checks are too slow or require hidden local state;
- cleanup removes useful migration documentation;
- release process cannot be repeated by another agent.

## Acceptance Criteria

- Compatibility cleanup is backed by passing proofs.
- Backend platform, SDK, and frontend ownership are release-ready.
- Remaining gaps are accurate and actionable.
