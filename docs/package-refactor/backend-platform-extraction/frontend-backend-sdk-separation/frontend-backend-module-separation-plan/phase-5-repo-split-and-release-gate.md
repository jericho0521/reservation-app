# Phase 5: Repo Split and Release Gate

## Purpose

Define the final gate for turning the modular architecture into a real product
split: backend product repository, installable SDK, and frontend consumer
repository or fixture.

## Write Scope

- Materialize or document the backend product repository candidate and its
  bootstrap commands.
- Materialize or document the frontend consumer repository candidate and its
  bootstrap commands.
- Define SDK release artifact checks, version compatibility, and consumer
  upgrade rules.
- Define live proof requirements for disposable database, RLS/tenant isolation,
  durable idempotency, backend deployment, SDK/direct parity, optional chat, and
  frontend smoke.
- Define compatibility route deprecation/removal gates and rollback rules.

## Non-Goals

- Do not push to `main` or `staging`.
- Do not publish packages or create external repositories without explicit user
  approval.
- Do not remove compatibility routes before live parity and rollback criteria
  are satisfied.
- Do not call a generated temporary tree a completed repository split.

## Required Checks

- Backend repo candidate can bootstrap, build, and test without current
  frontend source.
- SDK artifact can be installed by a clean app from a package artifact or
  approved registry.
- Frontend consumer can build and smoke against an external backend base URL.
- Strict live proof commands fail closed when disposable infrastructure is not
  configured.
- Compatibility route inventory is complete and each route has a remove,
  deprecate, or keep decision with rollback notes.

## Acceptance Criteria

- There is an evidence-based release decision: what is ready, what remains
  blocked, and what cannot be removed yet.
- The backend can be treated as the product infrastructure and services repo.
- The frontend can be treated as a replaceable consumer.
- The SDK can be treated as the integration contract for future apps.

## Downstream Update Requirement

This is the final phase in this folder. If it discovers missing backend, SDK,
or frontend prerequisites, update the earlier owning phase first, then update
this phase and `../remaining-modularity-gaps.md`.

