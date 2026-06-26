# Phase 2: SDK Artifact and Contract Boundary

## Goal

Turn the SDK from a workspace package into the only package a frontend needs to
install to talk to the backend platform.

## SDK Owns

- public TypeScript client
- public contract types or re-exported contract package
- request builders and response parsing
- auth/header/idempotency helper behavior
- stable error model
- package exports, versioning, and compatibility policy

## SDK Must Not Own

- database access
- Supabase service clients
- LangChain/provider/retrieval workflows
- backend route handlers or domain service implementations
- frontend components, hooks, pages, or app-specific UI assumptions
- workspace-only imports that break outside the monorepo

## Inputs To Read

- Phase 0 and Phase 1 from this folder
- `../phase-14-sdk-release-consumer-contract.md`
- `../phase-18-sdk-distribution-and-contract.md`
- `../phase-27-sdk-public-release-surface.md`
- `packages/sdk/package.json`
- `packages/sdk/src/**`
- `packages/contract-types/package.json`
- `packages/contract-types/src/**`
- package pack/install proof scripts

## Worker Tasks

1. Define the public SDK exports and document which APIs are stable.
2. Ensure SDK dependencies are frontend-safe and installable without workspace
   links.
3. Add package artifact inspection that fails on backend implementation files,
   migrations, provider workflows, frontend UI, or workspace-only references.
4. Add or strengthen a clean install fixture that consumes the packed SDK from
   outside this repository's workspace graph.
5. Update Phases 3, 5, and 6 if the SDK setup flow, package name, auth model, or
   version policy changes.

## Proof Commands

- `corepack pnpm run sdk:pack`
- `corepack pnpm run sdk:pack-inspect`
- `corepack pnpm run sdk:registry-install-proof`
- `corepack pnpm run sdk:direct-live-parity`

These commands are safe when run in default non-strict mode. They must inspect
or pack locally and must not publish. Strict registry/live modes require explicit
environment configuration and approval because they may contact external
services.

## Acceptance Criteria

- A frontend can install the SDK artifact without this monorepo.
- SDK artifact contains only frontend-safe public contract/client code.
- SDK calls the backend `/v1` API and does not reimplement backend business
  behavior.
- SDK/direct HTTP parity proof exists for the public workflows.
