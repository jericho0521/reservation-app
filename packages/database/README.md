# Reservation Platform Database

Private workspace package for backend-owned database migration bundle artifacts.

This package makes the Phase 5 migration bundle concrete inside the workspace:

- `src/` exports a DB-client-neutral migration index reader, plan builder, and
  future runner contract for package consumers.
- Core Supabase migration targets live under `migrations/supabase/`.
- Optional AI retrieval migrations live under `migrations/supabase/optional/ai-retrieval/`.
- Development compatibility seed data lives under `seeds/development/`.
- `migrations/supabase/migration-index.json` is a generated apply-plan and
  checksum index for future standalone migration runners.
- The extensions migration includes the `pgcrypto` and `pg_trgm` setup needed
  by UUID defaults and booking search indexes.
- The tenant/auth compatibility migration includes the `admin_users` table and
  `public.is_admin()` helper required by later RLS policies.
- The catalog, resource, booking, maintenance, and availability-rule migrations
  include the platform-owned
  `services`, `venues`, `resource_layouts`, `reservable_resources`, `bookings`,
  `reservation_items`, `service_seat_maintenance`, and
  `service_availability_rules` schemas curated from `supabase/base-schema.sql`,
  plus the maintenance replacement RPC and grants.
- The core RLS migration includes runnable policies curated from
  `supabase/reservations-rls.sql`.
- The core security hardening migration includes package-owned function
  search-path hardening and RPC privilege reassertions curated from
  `supabase/security-hardening.sql`, while excluding mixed-ownership
  seed/backfill, content/reporting, AI, and storage sections.
- The reservation RPC migrations include the canonical
  `public.create_reservation_atomic(payload jsonb)` mutation and
  `public.read_reservation_availability_snapshot(uuid, date)` read function,
  hardened search paths, and service-role-only execute grants curated from
  `supabase/create-reservation-atomic.sql`.
- The platform idempotency migration includes the durable
  `platform_idempotency_records` table plus claim/store RPCs curated from
  `packages/reservations-supabase/sql/platform-idempotency.sql`.

The TypeScript API is intentionally DB-client-neutral. It validates the
generated Supabase migration index shape, normalizes core, optional AI
retrieval, and development seed entries, and builds deterministic plans:

- core migrations are always included in index order;
- optional AI retrieval migrations are appended after core migrations only when
  requested;
- development seed files are returned as seed entries after migrations only
  when requested;
- `MigrationExecutor` receives SQL text and ordered plan entries from a future
  caller, but this package does not open a database connection or execute SQL.

These are package-owned migration assets with preserved source provenance,
stable migration ordering, and a generated checksum/byte-size index. The index
is an apply-plan artifact only. It does not claim live migration execution,
disposable database bootstrap, tenant isolation, RLS correctness, or durable
database-backed idempotency proof until those checks run against a seeded
database.

Run the bundle verifier from the repo root:

```sh
pnpm run database:verify-migration-bundle
```

Run the package-local plan/contract tests from the repo root:

```sh
pnpm --filter @reservation-platform/database run test
```

The verifier first checks `migration-index.json` for deterministic path, order,
classification, checksum, and byte-size drift. It then checks the manifest
shape, confirms every runnable manifest target exists in this package, and
guards the critical extensions, tenant/auth, catalog, resource, booking,
maintenance, availability-rule, RLS, atomic RPC, core security hardening, and
idempotency migrations against regressing to placeholder-only assets or
absorbing excluded mixed-ownership SQL.
