# Phase 0: Current Separation Status Audit

## Goal

Produce the factual baseline for the current branch: what is already separated,
what is only modular inside the monorepo, and what still prevents the frontend
from being a replaceable consumer of the backend product through the SDK.

## Inputs To Read

- `../README.md`
- `../remaining-modularity-gaps.md`
- `../phase-0-current-coupling-audit-results.md`
- `../phase-1-backend-module-boundary-results.md`
- `../phase-2-sdk-boundary-public-client-results.md`
- `../phase-3-frontend-api-migration-results.md`
- `../phase-5-ai-chat-workflow-split-results.md`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-11-backend-repo-extraction.md`
- `../phase-12-frontend-repo-consumer-proof.md`

## Work

1. Inventory the current frontend runtime paths, backend-owned paths, SDK paths,
   compatibility route paths, database/migration paths, and optional AI chat
   paths.
2. Classify each path as backend product, SDK public surface, frontend consumer,
   shared public contract, compatibility-only, reference-only, or blocked.
3. Identify every active dependency where frontend source still relies on
   backend internals, compatibility routes, workspace links, current-app server
   helpers, or monorepo-only scripts.
4. Record which existing checks are local readiness only and which checks are
   actual external proof.

## Deliverables

- A status section in this phase file or a sibling results file with:
  - separated now;
  - modular but not product-separated;
  - still coupled;
  - proof required before claiming separation.
- Updates to later phase docs if the audit changes phase ownership.
- Updates to `../remaining-modularity-gaps.md` for any new or closed gap.

## Acceptance Criteria

- The audit does not claim full separation from package boundaries alone.
- Every blocker has a later owning phase.
- Every later phase reflects the audit's path ownership and proof requirements.

## Subagent Notes

Spec review should reject any result that treats skipped readiness, dry-run
copying, or workspace package links as final product separation.
