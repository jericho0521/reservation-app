# Phase 4: Frontend Consumer Detachment

## Purpose

Make the current frontend behave like any external frontend. This phase answers:
can the UI build and run using only public config plus the SDK or direct `/v1`
HTTP, with no backend source ownership?

## Inputs To Read

- `phase-0-current-product-boundary-baseline.md`
- `phase-3-sdk-public-install-and-contract-surface.md`
- `../phase-26-frontend-consumer-detachment.md`
- `../phase-30-package-source-and-frontend-proof.md`
- `lib/reservation-platform-client.ts`
- `lib/reservation-chat-client.ts`
- frontend consumer inventory and smoke scripts
- current frontend app, form, admin, and chat source paths

## Write Scope

- frontend consumer inventory;
- public env contract;
- frontend-only package/build proof;
- browser smoke flow against external backend;
- `/api` compatibility usage blocker list;
- downstream Phase 5 and 6 assumptions.

## Non-Goals

- Do not import backend packages directly into frontend source.
- Do not expose service-role, database, or model-provider secrets to the
  browser.
- Do not keep using local `/api` compatibility routes in platform mode.
- Do not move backend behavior into frontend wrappers.

## Steps

1. Expand the frontend inventory until the current product UI can be treated as
   a runnable consumer candidate, not only a wrapper slice.
2. Ensure all platform-mode calls use an absolute backend base URL and `/v1`.
3. Keep local compatibility mode explicit and separate from platform mode.
4. Prove frontend install/typecheck/build outside backend workspace metadata.
5. Run browser smoke for public booking, admin reservation management, resource
   maintenance, and chat behavior against the external standalone backend.
6. Record every remaining `/api` dependency as a compatibility blocker.
7. Update Phase 5 and Phase 6 if frontend route coverage or env behavior
   changes.

## Acceptance Criteria

- Frontend candidate builds without backend source imports.
- Platform mode calls only the external backend origin and `/v1` routes.
- Browser smoke fails if the current frontend origin handles platform API
  traffic.
- Chat UI uses backend-owned chat API behavior or documents disabled behavior.
- Remaining compatibility routes have specific blockers.

## Subagent Handoff Notes

This worker should prefer proof over broad UI refactors. If a route cannot move
off `/api`, record the exact frontend dependency and route owner for Phase 6.
