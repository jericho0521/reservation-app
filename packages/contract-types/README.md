# @reservation-platform/contract-types

Public request, response, error, and idempotency contracts for the reservation
platform `/v1` API and SDK.

This package is frontend-safe. It must not import backend domain packages,
Supabase adapters, route handlers, React, Next.js, LangChain, provider SDKs, or
current app internals.

## Contract Artifacts

Generated public artifacts live in the repo-local contract package artifact
tree:

- `packages/contract-types/contracts/openapi.json`
- `packages/contract-types/contracts/json-schema/*.schema.json`

They are generated from `src/contract-artifact-registry.ts`, a package-local
registry for the public `/v1` DTO and endpoint surface. Run
`corepack pnpm --filter @reservation-platform/contract-types run contracts:generate`
after changing the registry, then use
`corepack pnpm --filter @reservation-platform/contract-types run contracts:check`
to verify committed artifacts are current.
