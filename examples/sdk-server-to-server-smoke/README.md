# Reservation Platform SDK Server-To-Server Smoke

This fixture proves a clean server integration can install the packed
`@reservation-platform/sdk` and `@reservation-platform/contract-types` tarballs
and pass a caller-owned server credential without importing the current app,
Supabase helpers, backend adapters, React, Next.js, LangChain, or UI code.

From the repository root, first pack the local packages:

```powershell
corepack pnpm run packages:pack
```

This is safe in the current workspace. It builds local package declarations and
writes `.tgz` files under ignored `dist-packages/`; it does not publish.

Then install and run the fixture:

```powershell
$env:CI='true'; corepack pnpm --dir examples/sdk-server-to-server-smoke install --config.package-import-method=copy
corepack pnpm --dir examples/sdk-server-to-server-smoke run typecheck
corepack pnpm --dir examples/sdk-server-to-server-smoke run smoke
```

These commands are safe for the fixture. They install local tarballs into
`examples/sdk-server-to-server-smoke/node_modules`, run TypeScript resolution,
and execute an in-memory `/v1` smoke backend.

The smoke covers:

- server credential forwarding through `getAccessToken`.
- tenant and venue context headers.
- tenant context read parity.
- availability read parity.
- reservation create/replay/key-misuse with idempotency.
- server/admin reservation listing.
- safe read retry behavior.
- timeout/abort behavior without retrying.
- missing server credential error shape.

This fixture is not a live backend integration test. It proves clean package
installation, exports, declarations, server request construction, and
server-owned credential handling before registry publishing.
