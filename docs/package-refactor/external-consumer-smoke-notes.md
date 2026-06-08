# External Consumer Smoke Notes

Phase 9 verified the reservation packages from a clean TypeScript consumer
without importing this repository's Next.js app, `lib/` folder, or UI code.
Phase 17 extends the same fixture to verify the headless chat core package.

## Install Method Tested

From the repository root:

```powershell
corepack pnpm run packages:pack
```

This is safe to run in the current workspace. It builds package declarations
and writes generated tarballs under ignored `dist-packages/`; it does not
publish packages or touch production data.

In a clean consumer outside the host app import tree:

```powershell
corepack pnpm init
corepack pnpm add C:\Users\User\.codex\worktrees\d8b0\reservation-app\dist-packages\project-play-reservation-chat-core-0.0.0.tgz C:\Users\User\.codex\worktrees\d8b0\reservation-app\dist-packages\project-play-reservations-core-0.0.0.tgz C:\Users\User\.codex\worktrees\d8b0\reservation-app\dist-packages\project-play-reservations-supabase-0.0.0.tgz @supabase/supabase-js@^2.90.1 typescript@^5 tsx@^4.21.0 @types/node@^20
```

This installs the internal tarballs by package name. The chat core and Supabase
adapter tarballs both declare `@project-play/reservations-core` as a peer
dependency, so consumers must install the matching core tarball alongside them.

## Verification Run

Temporary clean consumer path:

- `C:\tmp\reservation-external-consumer-smoke`

Commands run:

```powershell
corepack pnpm exec tsc --noEmit
node -e "import('@project-play/reservations-core').then((m)=>console.log(Boolean(m.generateAvailabilityTimeSlots), Boolean(m.validateReservationRequest)))"
corepack pnpm smoke
```

Results:

- TypeScript declarations resolved from installed package tarballs.
- Chat core imports resolved from `@project-play/reservation-chat-core` package
  root.
- Chat tool factory built fake repository-backed tools for service listing,
  availability, prepared booking, host knowledge, and a host-owned custom
  directions tool.
- Prepared booking tool output mapped to a `booking_confirmation` action.
- Configurable domain guard and prompt section builders ran with host-provided
  copy.
- Chat core smoke did not require Next.js, React, Supabase, OpenRouter,
  LangChain, or host app source paths.
- Plain Node ESM import resolved the package root at runtime.
- Core examples ran for Racing Simulator assigned resources, PS5 quantity
  booking, and movie ticketing assigned seats.
- Supabase repository construction ran against a mocked client.
- `createReservationAtomic` called `create_reservation_atomic` with a single
  `payload` parameter and mapped `resource_conflict` into the documented
  validation shape.

## Committed Fixture

A repeatable fixture lives at `examples/external-consumer-smoke`.

From the repository root:

```powershell
corepack pnpm run packages:pack
Set-Location examples/external-consumer-smoke
$env:CI='true'; corepack pnpm install --config.package-import-method=copy
corepack pnpm run typecheck
corepack pnpm run smoke
```

The fixture imports only:

- `@project-play/reservation-chat-core`
- `@project-play/reservations-core`
- `@project-play/reservations-supabase`

It declares `@supabase/supabase-js` explicitly for the adapter smoke test.
There is no LangChain adapter package today, so no LangChain-specific smoke is
required for Phase 17.

The fixture install was verified with `CI=true` for non-interactive PowerShell
and `--config.package-import-method=copy` on Windows because the default pnpm
hardlink import method produced unreadable chat tarball files in this sandbox
after package-store extraction.

## Package Contract Changes

- Core package source now emits Node-compatible ESM relative imports with `.js`
  specifiers, so tarball runtime imports and NodeNext declaration resolution
  both work in external consumers.
- Chat core package now treats `@project-play/reservations-core` as a peer
  dependency and local workspace dev dependency. Consumers installing the chat
  tarball must install the matching core tarball too.
- Supabase adapter package now treats `@project-play/reservations-core` as a
  peer dependency and local workspace dev dependency. Consumers installing the
  adapter tarball must install the core tarball too.
- Supabase adapter tarball includes `sql/create-reservation-atomic.sql`.
  Production Supabase consumers must apply this SQL before relying on atomic
  booking creation.
