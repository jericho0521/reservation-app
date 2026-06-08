# Package Refactor Handoff Checklist

Use this checklist before claiming the reservation system is ready to drop into another app.

## Package Boundary

- [x] Core package has no Next.js dependency.
- [x] Core package has no React dependency.
- [x] Core package has no Supabase dependency.
- [x] Supabase adapter depends on core, not vice versa.
- [x] Host app imports packages through package names.

## API and Types

- [x] Public exports are documented.
- [x] Internal helpers are not exported accidentally.
- [x] Repository interfaces are stable enough for another adapter.
- [x] Validation result codes are documented.
- [x] Legacy host app fields are separated from package-native types.

## Database and Adapter

- [x] Required Supabase tables are documented.
- [x] RLS setup is documented.
- [x] SQL setup assets are included or linked.
- [x] Atomic booking RPC is implemented or clearly marked as a blocker.
- [x] Maintenance labels support generic resources.

## Examples

- [x] Racing Simulator fixture passes.
- [x] PS5 quantity fixture passes.
- [x] Movie ticketing fixture passes.
- [x] Examples do not import host app UI.

## Verification

- [x] Core package tests pass.
- [x] Supabase adapter tests pass.
- [ ] Host app API tests pass.
- [ ] Host app build passes.
- [x] Package build emits type declarations.

## Publishing Readiness

- [ ] Package names finalized.
- [x] Versioning policy documented.
- [x] README files complete.
- [x] Changelog policy documented.
- [x] npm publishing remains intentionally blocked or explicitly approved.

## Phase 6 Completion Notes

- Package entrypoints now export only the package root and point at `dist`
  JavaScript and declaration output.
- Package builds emit ESM JavaScript, source maps, declaration files, and
  declaration maps under each package `dist` directory.
- Root package scripts include `packages:build` and `packages:test` for the two
  reservation workspace packages.
- Package README files document public exports, examples, versioning,
  changelog policy, publish readiness, and unresolved blockers.
- npm publishing remains intentionally blocked by `private: true`.
- Atomic booking remains unresolved. The Supabase adapter validates before
  insert, but does not perform a transaction-safe RPC and can race under
  concurrent booking creation.
