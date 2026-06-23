# Phase 3: Current Frontend Consumer Detachment

## Goal

Turn the current racing simulator app into a normal frontend consumer of the
backend platform and SDK.

## Inputs To Read

- `phase-0-separation-source-of-truth.md`
- `phase-2-sdk-client-product-surface.md`
- `../frontend-consumer-repo-inventory.json`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-12-frontend-repo-consumer-proof.md`
- `../phase-17-physical-frontend-repo-split.md`
- `../phase-22-frontend-repo-materialization.md`
- `../phase-26-frontend-consumer-detachment.md`

## Write Scope

- frontend consumer inventory
- frontend platform client wrappers
- frontend-only readiness tests
- frontend environment documentation
- downstream updates to Phases 4 and 6

## Tasks For Worker Subagent

1. Ensure frontend code calls backend behavior through SDK/client wrappers.
2. Keep frontend inventory limited to UI, browser-safe utilities, and
   frontend-safe adapters.
3. Block frontend imports of backend modules, database helpers, route handlers,
   provider workflows, and server-only secrets.
4. Keep compatibility route usage explicit and temporary.
5. Prove the current frontend can be materialized as a consumer repo candidate.
6. Update Phase 4 with any setup steps an external frontend must copy.

## Review Gates

Spec reviewer rejects when:

- frontend source imports backend implementation;
- frontend requires service-role or provider secrets;
- current-app compatibility routes are hidden behind permanent naming.

Quality reviewer rejects when:

- scans are too broad and noisy to enforce;
- fallback behavior masks a broken backend platform URL;
- frontend inventory includes full backend or API route folders.

## Acceptance Criteria

- Current frontend has a documented consumer boundary.
- Backend logic stays outside frontend consumer source.
- Remaining current-app coupling is documented as a blocker.
