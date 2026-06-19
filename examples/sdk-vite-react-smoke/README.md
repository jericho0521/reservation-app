# Reservation Platform SDK Vite/React Smoke

This fixture proves a clean Vite/React browser consumer can install the packed
`@reservation-platform/sdk` and `@reservation-platform/contract-types` tarballs,
build a browser bundle, and call representative `/v1` reservation-platform
flows without importing the current app, route handlers, Supabase clients,
backend packages, LangChain, Next.js, Node builtins, or server-only secrets.

From the repository root, first pack the local packages:

```powershell
corepack pnpm run packages:pack
```

This is safe in the current workspace. It builds local package declarations and
writes `.tgz` files under ignored `dist-packages/`; it does not publish.

Then install and run the fixture:

```powershell
corepack pnpm run sdk:smoke:vite:install
corepack pnpm run sdk:smoke:vite
```

These commands are safe for the fixture. They install only local package
tarballs plus Vite/React build tooling into
`examples/sdk-vite-react-smoke/node_modules`, typecheck the isolated fixture,
run the browser-safe SDK flow against a fixture-local in-memory `/v1` fetch
surface, build the Vite browser bundle, and scan fixture source plus bundled
output for forbidden backend/app imports and server-secret markers.

The browser smoke covers:

- metadata via `getMetadata()`.
- catalog via `listVenues()`, `listServices()`, and `listResources()`.
- availability via `listAvailability()`.
- reservation creation via `createReservation()` with a caller-owned
  idempotency key.
- reservation read via `getReservation()`.
- browser-safe bearer auth using `public-demo-token`.
- source and bundle scans for Supabase, Next.js server helpers, current app
  paths, backend packages, LangChain, Node-only markers, and server-secret
  strings.

This fixture is not a replacement for a separate Next.js consumer, live backend
parity, direct HTTP parity against a seeded backend, optional chat proof, or CI
wiring. It is the local-tarball Vite/React browser build proof required by the
external SDK readiness plan.
