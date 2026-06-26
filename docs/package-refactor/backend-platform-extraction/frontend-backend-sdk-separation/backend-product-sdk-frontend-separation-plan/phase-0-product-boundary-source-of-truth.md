# Phase 0: Product Boundary Source of Truth

## Goal

Create the authoritative map for what belongs to the backend product repo, what
belongs to the SDK, what belongs to the current frontend, and what remains only
as temporary compatibility or migration reference.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/remaining-modularity-gaps.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/README.md`
- `docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/frontend-consumer-repo-inventory.json`
- `package.json`

## Work

1. Produce or update a single ownership matrix covering:
   - backend product runtime source
   - backend product migrations and database proof
   - backend product optional AI chat workflow
   - SDK public source and contract types
   - current frontend consumer source
   - compatibility-only current app routes
   - reference-only migration files
2. Ensure every existing package, app, script, and plan-critical doc has exactly
   one primary owner or is explicitly marked compatibility/reference.
3. Record which files must not move into the backend repo, which files must not
   ship in the SDK, and which files the frontend may import.

## Acceptance Gates

- The ownership matrix blocks frontend UI, Next.js route handlers, browser
  helpers, current app auth helpers, and frontend-only dependencies from the
  backend product repo.
- The ownership matrix blocks backend route handlers, storage adapters,
  migrations, service-role config, LangChain/provider workflows, and database
  clients from the SDK and frontend.
- Every later phase in this folder can point to this matrix as its source of
  truth.

## Downstream Update Rule

If this phase changes ownership of any source area, update Phases 1 through 6
and the subagent handoff matrix before reporting done. If the change affects an
existing gap, also update `remaining-modularity-gaps.md`.

## Subagent Notes

This is a documentation and verification phase. Do not move source yet. The
worker should leave implementation tasks as explicit blockers for later phases
instead of quietly changing the target shape.
