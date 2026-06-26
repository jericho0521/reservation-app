# Phase 3: Frontend Consumer Detachment

## Goal

Make the current frontend behave like any other frontend consumer. It should use
public config and the SDK/HTTP contract, not backend source.

## Frontend-Owned Surface

- pages, layouts, and components;
- visual booking/admin/chat flows;
- client-side state and form validation;
- public backend base URL configuration;
- display handling for SDK errors.

## Work

1. Inventory frontend imports from backend packages.
2. Replace backend imports with SDK methods or contract-types.
3. Inventory calls to local `/api` compatibility routes.
4. Move frontend traffic to the standalone backend `/v1` API.
5. Keep only temporary compatibility routes with explicit deprecation notes.
6. Build and smoke the current frontend against an external backend URL.

## Proof Commands

- `corepack pnpm run current-frontend:boundary-check`
- `corepack pnpm run current-frontend:consumer-install-proof:strict`
- `corepack pnpm run current-frontend:external-backend-smoke:strict`

External backend smoke commands are safe only with disposable backend/database
targets. They should never point at production during refactor proof work.

## Subagent Instructions

- Do not add new direct imports from `packages/reservation-platform-*` into UI.
- If a frontend flow needs data missing from the SDK, update Phase 2 first.
- Keep UI behavior stable; this phase is about dependency direction, not redesign.

## Done When

- Current frontend builds without backend source imports.
- Runtime configuration can point to an external backend URL.
- Frontend proof works from a clean external-style consumer workspace.

