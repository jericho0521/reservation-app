# Reservation Platform SDK Plain TypeScript Smoke

This fixture proves a clean TypeScript consumer can install the packed
`@reservation-platform/sdk` and `@reservation-platform/contract-types` tarballs
without importing the current app, backend adapters, Supabase clients, React,
Next.js, LangChain, or UI code.

From the repository root, first pack the local packages:

```powershell
corepack pnpm run packages:pack
```

This is safe in the current workspace. It builds local package declarations and
writes `.tgz` files under ignored `dist-packages/`; it does not publish.

Then install and run the fixture:

```powershell
$env:CI='true'; corepack pnpm --dir examples/sdk-plain-typescript-smoke install --config.package-import-method=copy
corepack pnpm --dir examples/sdk-plain-typescript-smoke run typecheck
corepack pnpm --dir examples/sdk-plain-typescript-smoke run smoke
```

These commands are safe for the fixture. They install local tarballs into
`examples/sdk-plain-typescript-smoke/node_modules`, run TypeScript resolution,
and execute an in-memory `/v1` smoke backend.

The smoke covers:

- SDK and direct HTTP metadata parity.
- SDK and direct HTTP availability parity.
- reservation creation with a caller-owned idempotency key.
- idempotency replay with the same body/key.
- idempotency misuse error preservation.
- reservation read parity.
- `PlatformError` preservation for a missing reservation.
- tenant, venue, authorization, and correlation headers on every request.

This fixture is not a replacement for live backend smoke tests. It proves clean
package installation, exports, declarations, request construction, and direct
HTTP parity behavior without a deployed backend.
