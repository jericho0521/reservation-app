# Phase 0: Ownership Source of Truth

## Goal

Create one authoritative ownership map before more extraction work continues.
This prevents subagents from moving files across boundaries just to make builds
pass.

## Inputs To Read

- `../remaining-modularity-gaps.md`
- `../frontend-consumer-repo-inventory.json`
- `../../backend-package-ownership.md`
- `../../standalone-backend-extraction-manifest.json`
- `../compatibility-route-inventory.json`

## Work Items

1. Classify every relevant source area as one of:
   - backend product source;
   - SDK public package source;
   - frontend consumer source;
   - public contract/shared DTO source;
   - compatibility-only current-app adapter;
   - reference-only migration context.
2. Record the canonical owner for `apps/api`, `packages/reservation-platform-api`,
   `packages/reservations-core`, `packages/reservations-supabase`,
   `packages/database`, `packages/ai-chat`, `packages/sdk`,
   `packages/contract-types`, current `app/**`, `components/**`, `lib/**`, and
   `supabase/**`.
3. Add boundary rules that say which owners may import which other owners.
4. Update downstream phase docs if ownership changes any planned backend,
   frontend, SDK, or compatibility scope.

## Acceptance Criteria

- A subagent can determine where a file belongs without reading chat history.
- Backend product source excludes frontend routes, React components, browser
  Supabase helpers, and current-app compatibility glue.
- Frontend consumer source excludes backend packages, database migrations,
  service-role helpers, and provider workflows.
- SDK source is HTTP-only and frontend-safe.

## Proof Commands

- `corepack pnpm run backend-platform:verify-extraction-manifest`
- `corepack pnpm run backend-platform:verify-package-graph-boundary`
- `corepack pnpm run current-frontend:consumer-repo-readiness`

These commands are safe in this repo: they inspect manifests and local source
boundaries; they do not deploy, publish, or mutate live data.

## Reviewer Checklist

- Spec reviewer confirms every ambiguous source area has one owner.
- Quality reviewer confirms the ownership model can become automated checks.
- Both reviewers reject any plan that makes the frontend import backend source
  directly.
