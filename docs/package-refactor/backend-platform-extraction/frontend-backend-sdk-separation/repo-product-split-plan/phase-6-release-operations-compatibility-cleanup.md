# Phase 6: Release, Operations, and Compatibility Cleanup

## Purpose

Define the final gates before calling the modular backend platform ready:
release process, operations, rollback, support matrix, and compatibility route
cleanup.

## Inputs To Read

- Phases 0 through 5 in this folder
- `../phase-9-compatibility-route-removal.md`
- `../phase-15-operations-deprecation-release.md`
- `../phase-18-sdk-distribution-and-contract.md`
- `../phase-19-cross-repo-release-proof.md`
- `../compatibility-route-inventory.json`
- `../compatibility-route-removal-decision-log.md`
- `../remaining-modularity-gaps.md`

## Write Scope

- release checklist
- rollback and deprecation policy
- compatibility route removal decision updates
- SDK/backend compatibility matrix
- production readiness gates
- final remaining-gap status updates

## Non-Goals

- Do not delete routes unless the evidence gates are already satisfied.
- Do not publish packages or deploy production services without explicit
  approval.
- Do not mark readiness-only commands as completed release proof.
- Do not remove rollback paths before consumer migration is proven.

## Required Gates

Before compatibility routes can be removed or deprecated:

- backend product repo candidate installs, builds, and tests independently;
- disposable database migration/RLS/tenant/idempotency proof passes;
- deployed standalone backend health and `/v1` behavior pass;
- SDK artifact installs from outside the monorepo;
- SDK/direct HTTP parity passes against the same backend;
- current frontend runs as a consumer with standalone backend URL;
- clean external frontend fixture runs as a consumer;
- rollback path is documented and tested;
- support matrix documents compatible backend and SDK versions.

## Subagent Tasks

1. Convert evidence from Phases 2 through 5 into release gates.
2. Update compatibility route inventory with keep, deprecate, remove, or app
   owned decisions.
3. Write rollback steps for backend deployment, database migrations, SDK
   release, and frontend consumer configuration.
4. Define monitoring and support requirements for `/v1` API, idempotency,
   tenant auth, database errors, and optional chat workflows.
5. Update `../remaining-modularity-gaps.md` only when evidence closes a gap.
6. Record explicit blockers for anything still unproven.

## Review Gates

Spec reviewer must reject the phase when:

- cleanup is based on planned work instead of completed proof;
- route removal would break the current frontend consumer;
- release gates omit database/RLS/idempotency or SDK install proof;
- rollback instructions are missing.

Quality reviewer must reject the phase when:

- runbooks are vague or impossible to execute;
- compatibility decisions are not traceable to evidence;
- support/version policy does not help an external frontend upgrade safely.

## Acceptance Criteria

- The modular platform has an evidence-based release checklist.
- Compatibility cleanup decisions are explicit and reversible where needed.
- Remaining gaps are either closed with proof or listed as blockers.
- The final architecture is backend product repo plus installable SDK plus
  replaceable frontend consumers.
