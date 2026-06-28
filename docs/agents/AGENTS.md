# Repository Guidelines

## Project Structure & Module Organization

This branch is the modular booking platform monorepo. Backend runtime code lives
in `apps/api`. Reusable platform packages live in `packages/`, including
reservation domain logic, Supabase/Postgres adapters, database migrations, public
contract types, the SDK, optional AI chat modules, and frontend module packages.
Forkable frontend examples live in `apps/examples/`. Backend verification and
operational helpers live in `scripts/`; SQL compatibility and local Supabase
assets live in `supabase/`.

## Build, Test, and Development Commands

Use `pnpm`, since the repository includes `pnpm-lock.yaml` and CI expects pnpm.

- `pnpm dev`: starts the standalone backend API host from `apps/api`.
- `pnpm dev:backend`: starts the same backend host through the local helper.
- `pnpm build`: compiles backend packages and the standalone API skeleton.
- `pnpm packages:test`: runs backend package test suites.
- `pnpm test`: runs package tests, standalone API tests, and database migration bundle checks.
- `pnpm database:verify-migration-bundle`: checks package-owned migration metadata.

## Coding Style & Naming Conventions

Write TypeScript with strict typing and prefer package-local imports over root
aliases. Keep backend packages framework-neutral unless a package explicitly owns
a runtime adapter. Use camelCase for functions and variables, PascalCase for
types/classes, and double-quote imports where the surrounding file uses them.
Do not add React, Next.js, browser-only APIs, or frontend package dependencies
to backend modules. Frontend module packages should stay browser-safe and must
not import Supabase clients, database adapters, or backend-only runtime code.

## Testing Guidelines

Tests use Node's built-in test runner, usually through package scripts and
`tsx`. Keep tests close to the code they cover and name them `*.test.ts` or
`*.test.mjs`. Prioritize coverage for API contracts, reservation domain rules,
database migration metadata, adapters, SDK behavior, auth/idempotency behavior,
and optional AI chat module boundaries.

## Commit & Pull Request Guidelines

Use short conventional-style subjects such as `feat:`, `fix:`, `ci:`, `docs:`,
or `refactor:` followed by a concise imperative summary. Keep commits scoped by
layer: backend modules, frontend modules, docs, or examples.
Before merging into a release branch, note which backend tests and database
checks were run and whether live proofs were skipped.

## Security & Configuration Tips

Keep secrets in `.env` locally and never commit real credentials. Backend
runtime env owns database and service credentials such as
`RESERVATION_SUPABASE_URL`, `RESERVATION_SUPABASE_ANON_KEY`,
`RESERVATION_SUPABASE_SERVICE_ROLE_KEY`, and platform auth settings. External
frontends should receive only the backend URL and browser-safe public config;
they should not receive Supabase service-role keys or import backend packages.
