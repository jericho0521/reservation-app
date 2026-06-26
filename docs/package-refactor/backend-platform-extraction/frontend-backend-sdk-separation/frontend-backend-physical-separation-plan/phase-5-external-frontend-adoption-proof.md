# Phase 5: External Frontend Adoption Proof

## Goal

Prove the plug-and-play story from a frontend that starts outside this
repository: install the SDK, set a backend URL, build a UI, and call the backend
platform without copying backend source.

## Inputs To Read

- Phases 2, 3, and 4 from this folder
- SDK quickstart docs
- frontend consumer inventory
- external fixture scripts
- live backend proof evidence

## Worker Tasks

1. Create or update a clean external fixture outside the monorepo workspace graph.
2. Install the SDK artifact from an approved local tarball or registry source.
3. Configure only frontend-safe environment variables, especially backend base
   URL and public auth context.
4. Implement minimal flows for catalog, availability, reservation create/read,
   lifecycle mutation, resource maintenance if applicable, and chat if enabled.
5. Prove no backend source, database code, migrations, service secrets, or
   compatibility route files are copied into the external frontend.
6. Update Phase 6 with compatibility routes that can be removed and any routes
   that still need a deprecation window.

## Proof Commands

- `corepack pnpm run sdk:registry-install-proof`
- `corepack pnpm run current-frontend:consumer-repo-readiness`
- an external fixture install/build/smoke command documented by the worker

The external fixture proof is safe if it uses a temporary directory and local
tarballs. It may require network or registry access only when strict registry
mode is intentionally enabled.

## Acceptance Criteria

- The external frontend uses only SDK/package artifacts plus backend URL.
- The external frontend can build and complete smoke flows.
- No workspace links are required.
- The proof would still work for a different product frontend, such as movie
  ticketing, as long as that frontend builds UI around the same backend
  reservation contracts.
