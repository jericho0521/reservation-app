# External Consumer Smoke Notes

Phase 9 verified the reservation packages from a clean TypeScript consumer
without importing this repository's Next.js app, `lib/` folder, or UI code.

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
corepack pnpm add C:\Users\User\.codex\worktrees\d8b0\reservation-app\dist-packages\project-play-reservations-core-0.0.0.tgz C:\Users\User\.codex\worktrees\d8b0\reservation-app\dist-packages\project-play-reservations-supabase-0.0.0.tgz @supabase/supabase-js@^2.90.1 typescript@^5 tsx@^4.21.0 @types/node@^20
```

This installs both internal tarballs by package name. The Supabase adapter
declares `@project-play/reservations-core` as a peer dependency, so consumers
must install the matching core tarball alongside the adapter tarball.

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
corepack pnpm install
corepack pnpm run typecheck
corepack pnpm run smoke
```

The fixture imports only:

- `@project-play/reservations-core`
- `@project-play/reservations-supabase`

It declares `@supabase/supabase-js` explicitly for the adapter smoke test.

## Package Contract Changes

- Core package source now emits Node-compatible ESM relative imports with `.js`
  specifiers, so tarball runtime imports and NodeNext declaration resolution
  both work in external consumers.
- Supabase adapter package now treats `@project-play/reservations-core` as a
  peer dependency and local workspace dev dependency. Consumers installing the
  adapter tarball must install the core tarball too.
- Supabase adapter tarball includes `sql/create-reservation-atomic.sql`.
  Production Supabase consumers must apply this SQL before relying on atomic
  booking creation.
