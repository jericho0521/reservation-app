# Phase 0: Separation Source of Truth

## Goal

Create one authoritative description of what belongs to the backend platform,
what belongs to the SDK, and what belongs to frontend consumers.

## Inputs To Read

- `../remaining-modularity-gaps.md`
- `../README.md`
- `../frontend-consumer-repo-inventory.json`
- `../compatibility-route-inventory.json`
- package manifests under `packages/`
- current `app/api`, `lib`, `components`, and frontend route usage

## Write Scope

- this plan folder
- separation inventory docs
- boundary scan documentation
- downstream phase updates when assumptions change

## Tasks For Worker Subagent

1. List backend-owned source areas: API routes, services, repositories,
   migrations, tenant/auth enforcement, idempotency, chat workflows, provider
   integrations, and operations.
2. List SDK-owned source areas: public client exports, public types, response
   mapping, errors, and frontend-safe configuration.
3. List frontend-owned source areas: pages, components, browser state, UI copy,
   styling, and app-specific adapters.
4. Mark every compatibility route as temporary, app-owned, or backend-product
   API candidate.
5. Record unresolved coupling as explicit blockers, not hidden assumptions.
6. Update later phase files if the boundary changes.

## Review Gates

Spec reviewer rejects when:

- backend internals are described as frontend-safe;
- SDK responsibilities include database, provider, or server-only runtime code;
- compatibility routes are treated as permanent backend API without proof.

Quality reviewer rejects when:

- the source of truth is too vague for a worker to apply;
- ownership categories overlap without a stated migration decision;
- unresolved coupling is omitted from downstream phases.

## Acceptance Criteria

- Backend, SDK, and frontend ownership are documented separately.
- Remaining coupling is mapped to a later phase.
- Later phase files reflect the same boundary language.
