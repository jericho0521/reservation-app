# Phase 5: Cross-Repo Live Adoption Proof

## Goal

Prove the product model end to end from separated roots: backend platform,
package source, SDK, and frontend consumer. This is the point where "plug and
play" becomes evidence instead of architecture intent.

## Inputs To Read

- Phase 0 ownership baseline from this folder.
- Phase 1 backend deployment/runtime proof.
- Phase 2 SDK package proof.
- Phase 3 frontend consumer proof.
- Phase 4 chat contract proof.
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/external-separation-proof-results.md`

## Work

- Start or deploy the backend platform from a backend-owned root.
- Apply backend-owned migrations to disposable or approved live infrastructure.
- Install SDK and contract types from the approved package source into an
  external frontend root.
- Configure frontend with backend URL, tenant, venue, auth, and chat settings.
- Use `corepack pnpm run dev:platform` only as current-repo rehearsal; final
  proof must still run from separated roots with an approved package source.
- Run browser smokes for public booking, admin workflows, resource maintenance,
  SDK fixture flow, and chat flow if chat is part of the release.
- Run SDK/direct HTTP parity against the same backend target.
- Fail the proof on current-frontend `/api` fallback, backend `/api` fallback,
  workspace package links, missing CORS, missing tenant headers, or missing
  idempotency on mutations.

## Deliverables

- Updated external proof result entry.
- Exact commands, env names, backend URL shape, package source, and temp roots.
- List of observed `/v1` calls.
- List of failed or intentionally skipped proof surfaces.
- Compatibility route cleanup inputs for Phase 6.

## Done Criteria

- Backend, SDK, and frontend prove the same flow from separated roots.
- Browser-observed calls target standalone `/v1`.
- No monorepo workspace link or current frontend compatibility route is needed
  for the proven flows.
- Any skipped proof is recorded as a release blocker or explicit exception.

## Downstream Updates Required

Update Phase 6 with every route, endpoint, package, and proof result changed by
this phase. If this phase finds a missing backend capability, update Phase 1
before retrying the live proof.
