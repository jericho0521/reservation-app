# @project-play/reservations-supabase

Supabase adapter for Project Play reservation packages.

This package converts Supabase reservation rows into
`@project-play/reservations-core` domain types and exposes a repository factory
for host apps that store reservations in Supabase.

## Public API

Import from the package root only:

```ts
import {
  createSupabaseReservationRepository,
  adaptServiceMetadata,
  RESERVATION_SUPABASE_TABLES,
} from "@project-play/reservations-supabase";
```

The public export surface is intentionally limited to `src/index.ts`. Internal
files are not exposed as package subpaths.

Key exports:

- `createSupabaseReservationRepository(client)` for repository access.
- Row adapters such as `adaptServiceMetadata`, `adaptBookingRows`,
  `adaptReservableResources`, `adaptResourceLayout`, and
  `adaptMaintenanceRows`.
- Supabase table/select constants.
- Row interfaces for service metadata, resources, layouts, maintenance labels,
  and availability rules.

## Database Setup

The adapter expects the host Supabase schema documented in `sql/README.md`.
Required tables include:

- `services`
- `bookings`
- `reservable_resources`
- `resource_layouts`
- `reservation_items`
- `service_seat_maintenance`
- `service_availability_rules`

Maintenance labels are treated as generic resource labels by the adapter, even
when the legacy table name still says `seat`.

## Atomic Booking Status

Atomic booking is unresolved.

`createReservationWithValidation` validates through
`@project-play/reservations-core` before inserting rows, but it does not run in a
transaction-safe RPC. Concurrent requests can still race until a real database
transaction or RPC such as `create_reservation_atomic(payload jsonb)` is
implemented and wired through this adapter.

## Build and Test

Run from the repository root:

```powershell
pnpm --filter @project-play/reservations-supabase run build
```

This is safe to run in the current workspace. It compiles the adapter to
`packages/reservations-supabase/dist` and emits declaration files; it does not
publish or modify production data.

```powershell
pnpm --filter @project-play/reservations-supabase run test
```

This is safe to run in the current workspace. It builds the core dependency,
builds the adapter, then runs the adapter tests with Node's test runner.

## Example Consumers

Example Supabase-shaped rows live in `examples/domain-row-examples.ts` and map
to the same Racing Simulator, Playstation 5 quantity, and Movie Ticketing
domains documented in `docs/package-refactor/example-consumers.md`.

## Versioning and Changelog Policy

The package remains private at version `0.0.0` until final package names,
ownership, release workflow, and atomic booking strategy are approved. After
publishing is approved, use semantic versioning:

- Patch: adapter bug fixes with no public API contract change.
- Minor: compatible row support, adapter helpers, or documented table metadata.
- Major: breaking row, repository, or database setup contract changes.

Record release notes in a package changelog or repository release notes before
the first public publish.

## Publish Readiness

Ready:

- ESM build output and declaration files are configured.
- Public exports are rooted at `dist/index.js` and `dist/index.d.ts`.
- Dependency on `@project-play/reservations-core` is explicit.
- SQL setup expectations are documented.

Blocked:

- npm publishing is intentionally blocked by `private: true`.
- Final package name and release ownership are not approved yet.
- Atomic booking needs a real transaction-safe Supabase implementation before
  this adapter is safe for concurrent production booking creation.
