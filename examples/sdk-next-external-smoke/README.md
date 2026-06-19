# Reservation Platform SDK Next External Smoke

This fixture proves a separate Next.js app can install the packed
`@reservation-platform/sdk` and `@reservation-platform/contract-types` tarballs,
build outside the repository's main `app/**` tree, and call representative
reservation-platform `/v1` flows without importing current app internals,
route handlers, backend packages, Supabase, LangChain, or storage adapters.

From the repository root, first pack the local packages:

```powershell
corepack pnpm run packages:pack
```

This is safe in the current workspace. It builds local package declarations and
writes `.tgz` files under ignored `dist-packages/`; it does not publish.

Then install and run the fixture:

```powershell
corepack pnpm run sdk:smoke:next:install
corepack pnpm run sdk:smoke:next
```

These commands are safe for the fixture. They install only local package
tarballs plus Next/React build tooling into
`examples/sdk-next-external-smoke/node_modules`, typecheck the isolated fixture,
run the SDK flow against a fixture-local in-memory `/v1` fetch surface, build
the separate Next app, and scan fixture source plus `.next/server` and
`.next/static` output for forbidden current-app/backend imports and
server-secret markers.

The smoke covers:

- metadata via `getMetadata()`.
- catalog setup via `listVenues()`, `listServices()`, and `listResources()`.
- availability via `listAvailability()`.
- reservation creation via `createReservation()` with a caller-owned
  idempotency key.
- reservation read via `getReservation()`.
- direct raw `fetch` mutation parity by replaying the SDK create request with
  the same idempotency key and body.
- direct raw `fetch` read parity by reading the SDK-created reservation through
  the same fake `/v1` surface.
- browser-safe bearer auth using `public-next-demo-token`.
- source and build-output scans for current app paths, backend package names,
  Supabase, LangChain, storage adapters, route-handler markers, and
  server-secret strings.

The fixture does not use real server credentials. The token is intentionally a
browser-safe demo value, and no `RESERVATION_PLATFORM_BASE_URL` or secret env
vars are read by the app. A production Next consumer should keep privileged
server credentials in server-only code and pass only browser-safe tokens to
client-side SDK calls.

This fixture is not a replacement for live backend parity, optional chat proof,
private or public registry install checks, CI wiring, or final backend
extraction. It is the local-tarball separate Next.js proof required by the
external SDK readiness plan.
