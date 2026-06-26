# Phase 6: Compatibility Cleanup, Release, and Operations Gate

## Purpose

Use the external adoption proof to decide what happens to current compatibility
routes and how the backend product is released. This phase answers: what can be
removed, what must be deprecated, and what operational rules protect consumers?

## Inputs To Read

- Phase 0 through Phase 5 files in this folder
- `../compatibility-route-removal-decision-log.md`
- `../phase-35-compatibility-cleanup-release-decision.md`
- `../remaining-modularity-gaps.md`
- `../external-separation-proof-results.md`
- compatibility route inventory and removal gate scripts
- backend deployment/readiness docs
- SDK release notes and compatibility matrix

## Write Scope

- compatibility route decisions;
- deprecation notices and migration guidance;
- release checklist;
- rollback plan;
- support matrix;
- operational readiness docs;
- `../remaining-modularity-gaps.md`.

## Non-Goals

- Do not delete routes before replacement paths are proven by Phase 5.
- Do not keep routes indefinitely without owner, blocker, and removal condition.
- Do not publish packages or deploy externally without explicit approval.
- Do not claim production readiness if hosted deployment, monitoring, backup, or
  rollback expectations are missing.

## Steps

1. Re-run compatibility route gates with Phase 5 evidence.
2. Classify each route as remove now, deprecate, or retain temporarily.
3. Remove only routes that are unused by frontend platform mode and replaced by
   proven SDK or standalone backend paths.
4. Add deprecation headers, docs, migration notes, or support-window rules for
   retained routes.
5. Update release notes, rollback steps, health check expectations, env docs,
   and support matrix.
6. Run focused tests plus the relevant full verification suite.
7. Update `../remaining-modularity-gaps.md` and close out phase statuses.

## Acceptance Criteria

- Every compatibility route has an evidence-backed decision.
- Release docs distinguish local compatibility from backend product operation.
- Rollback instructions exist for backend deployment, SDK package release, and
  frontend cutover.
- Remaining gaps are either closed or have named owners and blockers.
- Final status does not overstate plug-and-play readiness.

## Subagent Handoff Notes

This worker is the final reviewer. It should be skeptical: if evidence is
missing, retain or deprecate with a blocker instead of removing compatibility
surface just to make the architecture look complete.
