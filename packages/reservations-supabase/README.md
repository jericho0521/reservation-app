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
- `createReservationAtomic(input)` and `createReservationAtomically(input)` on
  the repository for transaction-safe booking creation through Supabase RPC.
- Row adapters such as `adaptServiceMetadata`, `adaptBookingRows`,
  `adaptReservableResources`, `adaptResourceLayout`, and
  `adaptMaintenanceRows`.
- Supabase table/select constants.
- `SupabaseAtomicReservationError` and atomic RPC result/error types for host
  apps that map database conflict codes into UI messages.
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

## Atomic Booking RPC

Install `sql/create-reservation-atomic.sql` in the host Supabase project, then
call the repository's atomic method from trusted server-side code for production
booking writes:

```ts
const repository = createSupabaseReservationRepository(supabaseAdminClient);
const result = await repository.createReservationAtomic({ reservation });

if (!result.ok) {
  // Map result.error into a host-specific UI message.
}
```

The installed RPC signature is:

```sql
public.create_reservation_atomic(payload jsonb)
```

The adapter sends the compatibility booking payload expected by the current
schema: `service_id`, customer fields, `booking_date`, `start_time`, `end_time`,
`seats_booked`, `seat_labels`, `reservation_items`, and `interface_type`.
`reservation_items` preserves each core `ReservationItem.quantity`, including
multi-capacity assigned or hybrid resources. On success, the RPC returns the
inserted `bookings` row and creates matching `reservation_items` rows in the
same transaction-safe operation.

Stable error codes are:

- `invalid_service`
- `invalid_reservation`
- `invalid_resource_labels`
- `missing_resource_labels`
- `maintenance_conflict`
- `resource_conflict`
- `not_enough_capacity`

`createReservationWithValidation` remains available for tests and legacy hosts,
but production booking writes should use `createReservationAtomic` or
`createReservationAtomically` so validation and insert happen at the storage
boundary.

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

An external tarball smoke fixture lives in
`../../examples/external-consumer-smoke` and verifies repository construction
against a mocked Supabase client.

## Internal Tarball Consumer Install

Until package names and registry publishing are approved, generate internal
tarballs from the repository root:

```powershell
corepack pnpm run packages:pack
```

This is safe to run in the current workspace. It builds package declarations
and writes generated tarballs under ignored `dist-packages/`; it does not
publish packages or touch production data.

Install the adapter with the matching core tarball in the consumer app:

```powershell
corepack pnpm add C:\path\to\reservation-app\dist-packages\project-play-reservations-core-0.0.0.tgz C:\path\to\reservation-app\dist-packages\project-play-reservations-supabase-0.0.0.tgz @supabase/supabase-js@^2.90.1
```

The adapter declares `@project-play/reservations-core` as a peer dependency, so
the matching core tarball must be installed alongside the adapter tarball. The
consumer should import from `@project-play/reservations-supabase` only, not
from this repository's source paths.

## Versioning and Changelog Policy

The package remains private at version `0.0.0`. The temporary
`@project-play/reservations-supabase` name is kept for workspace and internal
tarball distribution until final package identity, ownership, registry target,
and license policy are approved.

For local artifact verification, run from the repository root:

```powershell
pnpm --filter @project-play/reservations-supabase pack --pack-destination dist-packages
```

This is safe to run in the current workspace. It runs the package `prepack`
build, creates a local tarball under `dist-packages`, and does not publish or
modify production data.

After publishing is approved, use semantic versioning:

- Patch: adapter bug fixes with no public API contract change.
- Minor: compatible row support, adapter helpers, or documented table metadata.
- Major: breaking row, repository, or database setup contract changes.

Record release notes in a package changelog, pull request, or repository
release notes before sharing tarballs or publishing. Release notes must call out
SQL asset changes and the live Supabase/concurrency validation status.

## Publish Readiness

Ready:

- ESM build output and declaration files are configured.
- Public exports are rooted at `dist/index.js` and `dist/index.d.ts`.
- Dependency on `@project-play/reservations-core` is explicit.
- SQL setup expectations are documented.
- Package metadata and `prepack` build are configured for tarball artifacts.

Blocked:

- npm publishing is intentionally blocked by `private: true`.
- Final package name and release ownership are not approved yet.
- Registry distribution is deferred; use internal tarballs generated by
  `pnpm packages:pack` until policy changes.
- External consumers still need to install the SQL asset in their Supabase
  project before using atomic booking in production.
