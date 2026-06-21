# Phase 11: Backend Repository Extraction

## Purpose

Prepare the backend platform to live as its own repository or independently
deployable service, while the current frontend remains only one consumer.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/README.md`
- `docs/package-refactor/backend-platform-extraction/extraction-manifest.json`
- `docs/package-refactor/backend-platform-extraction/extraction-dry-run-plan.json`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-7-standalone-backend-cutover.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-10-live-platform-proof.md`
- `apps/api/**`
- backend-owned `packages/**`
- root package/workspace scripts

## Write Scope

- extraction manifest and dry-run plan
- backend repo bootstrap docs
- package/workspace ownership docs
- release gate docs
- this phase result doc, if created
- `remaining-modularity-gaps.md`

## Non-Goals

- Do not copy current frontend app code into the backend repo.
- Do not copy compatibility `app/api/**` route files as canonical backend code.
- Do not include local `.next`, cache, install artifacts, generated tarballs, or
  frontend-only assets.
- Do not make the SDK depend on unpublished workspace internals after
  extraction.

## Target Repository Shape

```text
reservation-platform-backend/
  apps/api/
  packages/api/
  packages/contract-types/
  packages/database/
  packages/reservations-core/
  packages/reservations-supabase/
  packages/ai-chat/
  packages/sdk/
  docs/
  scripts/
```

The exact names can change, but ownership cannot: frontend UI code stays out of
the backend platform repository.

## Implementation Steps

1. Update the extraction manifest with only backend-owned files and packages.
2. Keep compatibility shims as reference-only migration context, not canonical
   copied backend code.
3. Verify package export maps, dependency metadata, and scripts work without the
   current frontend workspace.
4. Add bootstrap docs for installing, configuring, testing, and deploying the
   backend repository.
5. Add SDK consumer docs that target the extracted backend API URL.
6. Run extraction dry-run and boundary scans.
7. Update release artifacts to describe what is backend platform, SDK, optional
   module, and excluded frontend app.

## Deliverables

- Updated extraction manifest.
- Updated extraction dry-run plan.
- Backend repo bootstrap guide.
- Backend-only package ownership table.
- Post-extraction verification command list.
- Consumer integration guide pointing at deployed `/v1`.

## Acceptance Criteria

- Extraction dry-run contains no frontend app code.
- Extracted backend package graph can build/test without current Next.js app.
- SDK remains HTTP-only and installable by external frontends.
- Current frontend can consume the extracted backend using only config and SDK
  or direct HTTP.
- `remaining-modularity-gaps.md` distinguishes true leftovers from completed
  repo-boundary work.

## Subagent Handoff Notes

Give the worker this file plus the extraction manifest and dry-run plan. The
worker must update Phase 7, Phase 8, and Phase 10 if repo extraction exposes a
missing runtime, consumer, or live proof requirement.
