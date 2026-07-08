# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm TypeScript monorepo for a modular reservation platform. Runtime
API code lives in `apps/api`; forkable frontend examples live in
`apps/examples/`. Reusable packages live in `packages/`: reservation domain
logic, platform API, Supabase/database adapters and migrations, contract types,
SDK, React hooks, UI components, AI chat, and WhatsApp automation. Root smoke
and e2e checks live in `tests/`; operational scripts live in `scripts/`; local
Supabase assets live in `supabase/`.

## Build, Test, and Development Commands

Use `pnpm` via Corepack; the repo pins `pnpm@10.33.2`.

- `pnpm dev` or `pnpm dev:backend`: starts the standalone backend API helper.
- `pnpm dev:memory`: starts the backend with the in-memory runtime.
- `pnpm build`: builds all packages plus the standalone API skeleton.
- `pnpm packages:test`: runs package-level TypeScript builds and tests.
- `pnpm test`: runs package tests, standalone API checks, and migration bundle verification.
- `pnpm test:smoke` / `pnpm test:e2e`: run root workflow tests.
- `pnpm packages:verify-boundaries`: checks SDK and frontend package boundaries.
- `pnpm database:verify-migration-bundle`: verifies migration index and bundle metadata.
- `pnpm deploy:verify`: validates standalone deployment and Docker files.

## Coding Style & Naming Conventions

Write strict TypeScript and keep imports package-local where possible. Use
camelCase for variables/functions, PascalCase for types/classes/components, and
match the quote style already used in each file. Backend packages should stay
framework-neutral unless they explicitly own a runtime adapter. Browser-safe
frontend packages must not import Supabase clients, database adapters, or
backend-only runtime code.

## Testing Guidelines

Tests use Node's built-in test runner, usually with `tsx`. Keep tests near the
code they cover and name them `*.test.ts`, `*.test.tsx`, or `*.test.mjs`. Root
workflow tests use `tests/smoke/**/*.smoke.ts` and `tests/e2e/**/*.e2e.ts`.
Prioritize reservation rules, API contracts, auth/idempotency, adapters,
migration metadata, SDK behavior, frontend package boundaries, AI chat, and
WhatsApp readiness/config behavior.

## Commit & Pull Request Guidelines

Follow the existing conventional style: `feat(...)`, `fix:`, `chore:`,
`docs:`, `test:`, or `refactor:` plus a concise imperative summary. Keep commits
scoped by layer when practical. Pull requests should explain the behavior change,
list tests or verification commands run, link related issues, and include
screenshots for visible frontend/example changes. Note any skipped live proofs
or environment-dependent checks.

## Security & Configuration Tips

Keep secrets in `.env` and never commit real credentials. Backend runtime owns
database and service credentials such as `RESERVATION_SUPABASE_URL`,
`RESERVATION_SUPABASE_ANON_KEY`, `RESERVATION_SUPABASE_SERVICE_ROLE_KEY`, and
platform auth settings. Browser apps should receive only the backend URL and
browser-safe public config.
