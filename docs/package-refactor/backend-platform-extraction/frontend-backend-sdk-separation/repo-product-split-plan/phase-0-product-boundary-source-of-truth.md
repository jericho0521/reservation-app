# Phase 0: Product Boundary Source of Truth

## Purpose

Create one authoritative ownership map before more files are moved or copied.
This phase prevents subagents from making builds pass by pulling backend code
into frontend apps or hiding frontend assumptions inside the SDK.

## Inputs To Read

- `../README.md`
- `../remaining-modularity-gaps.md`
- `../phase-20-separation-source-of-truth.md`
- `../phase-25-backend-product-repo-contract.md`
- `apps/api`
- `packages`
- `app/api`
- `lib/reservation-platform-client.ts`

## Write Scope

- ownership inventory docs or JSON manifests
- boundary decision logs
- updates to later phases in this folder when classifications change
- updates to `../remaining-modularity-gaps.md` when gap ownership changes

## Non-Goals

- Do not move source files yet.
- Do not delete compatibility routes.
- Do not publish packages.
- Do not claim the backend is separated from documentation alone.

## Required Classifications

Every relevant path must be classified as exactly one of:

- backend product source
- SDK public contract/source
- frontend consumer source
- shared contract source
- compatibility-only adapter
- reference-only migration context
- generated/cache/install artifact

## Subagent Tasks

1. Inventory all current backend, SDK, frontend, compatibility, database, and
   AI workflow paths.
2. Record which files are allowed in the backend product repo.
3. Record which files are allowed in frontend consumer repos.
4. Record which packages may be published or packed for SDK consumers.
5. Mark every current `app/api/**` reservation platform route as temporary
   compatibility, backend-owned target, or app-owned route.
6. Update later phase docs if any expected ownership boundary changes.

## Review Gates

Spec reviewer must reject the phase when:

- a path has no owner;
- a path has multiple conflicting owners;
- frontend source is marked backend-owned only because it is needed by a build;
- SDK source includes backend implementation, migrations, provider workflows, or
  UI;
- compatibility routes are treated as the final backend API.

Quality reviewer must reject the phase when:

- the inventory is impossible for scripts to consume later;
- names are too domain-specific for a generic reservation platform;
- the plan does not explain how future changes update downstream phases.

## Acceptance Criteria

- Ownership is explicit enough for a subagent to decide whether a file belongs
  in backend repo, frontend repo, SDK package, or nowhere.
- Later phases in this folder reflect the ownership map.
- `../remaining-modularity-gaps.md` still points each gap at the correct owner.
