# Phase 1: Backend Product Repository Boundary

## Goal

Make the backend platform able to exist as its own repository. The backend must
not require the current frontend app to run, test, deploy, or manage database
state.

## Required Boundary

Backend-owned:

- `/v1` HTTP API routes;
- reservation, catalog, availability, maintenance, and idempotency services;
- database migrations and proof fixtures;
- auth, tenant, and service token enforcement;
- optional LangChain or AI chat workflow runtime;
- deployment and observability configuration.

Not backend-owned:

- Next.js pages;
- React components;
- frontend route handlers used only as compatibility shims;
- UI-only analytics or form state.

## Work

1. Confirm backend-only package graph.
2. Remove or block imports from backend code into frontend-only modules.
3. Ensure `apps/api` can start as a standalone service.
4. Ensure backend runtime config is backend-specific and does not depend on
   `NEXT_PUBLIC_*` frontend variables.
5. Move or duplicate only necessary deployment docs/config for backend-only use.
6. Keep database migrations inside backend-owned packages or repo materialization
   manifests.

## Proof Commands

- `corepack pnpm run backend-platform:boundary-check`
- `corepack pnpm run backend-platform:standalone-live-proof:strict`
- `corepack pnpm run database:live-proof:strict`

Only run strict live commands with disposable database credentials. They are
safe for local proof when env values point at throwaway infrastructure.

## Subagent Instructions

- Scope edits to backend packages, `apps/api`, proof scripts, and backend docs.
- Do not modify frontend UI unless a backend import needs to be replaced with an
  SDK/HTTP boundary.
- Record any changed env names in Phases 2, 3, 4, and 5.

## Done When

- Backend runtime can be prepared from a backend-only workspace.
- Backend migrations and live database proof pass without frontend app source.
- No backend code imports UI or Next.js page modules.

