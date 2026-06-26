# Phase 3: Frontend Consumer Detachment

## Goal

Make the current frontend behave like an external consumer of the backend
platform and SDK. The current frontend should no longer be the owner of backend
logic.

## Inputs To Read

- `phase-0-current-separation-truth.md`
- `phase-2-sdk-productization.md`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-12-frontend-repo-consumer-proof.md`
- `../phase-17-physical-frontend-repo-split.md`
- `../phase-22-frontend-repo-materialization.md`
- `../phase-26-frontend-consumer-detachment.md`
- `scripts/verify-current-frontend-consumer-repo-readiness.mjs`
- current frontend app routes, components, hooks, and env usage

## Write Scope

- frontend source imports and SDK wiring
- frontend consumer readiness checks and tests
- generated frontend consumer package metadata
- this phase file and downstream phase docs

## Tasks For Worker Subagent

1. Replace direct frontend imports of backend modules with SDK/client calls or
   app-owned UI adapters.
2. Ensure frontend env uses public backend URL and public auth configuration
   only.
3. Keep server-only secrets, database clients, migrations, and provider
   workflow code out of generated frontend consumer source.
4. Validate generated frontend consumer package scripts and dependencies.
5. Add tests that fail when generated frontend source imports backend packages,
   server-only modules, or monorepo-only aliases.
6. Update external consumer and cleanup phases if any compatibility route or
   SDK assumption changes.

## Review Gates

Spec reviewer rejects when:

- current frontend still imports backend implementation packages;
- frontend generated package includes backend scripts or dependencies;
- frontend proof only passes because backend files were copied with it.

Quality reviewer rejects when:

- import scans are too broad or noisy to maintain;
- app-owned UI adapters hide server-only behavior;
- generated package metadata is not deterministic.

## Acceptance Criteria

- Current frontend can be materialized as a consumer-shaped app.
- Consumer readiness checks prove no backend source ownership.
- Frontend talks to backend behavior through SDK/client surfaces.
