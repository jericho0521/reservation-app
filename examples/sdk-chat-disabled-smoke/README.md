# Reservation Platform SDK Disabled Chat Smoke

This fixture proves an external package can install the packed
`@reservation-platform/sdk` and `@reservation-platform/contract-types`
tarballs, keep core reservation SDK methods usable, and preserve the backend
`chat_module_disabled` `PlatformError` body for every currently exposed SDK
chat method.

From the repository root, first pack the local packages:

```powershell
corepack pnpm run packages:pack
```

This is safe in the current workspace. It builds local package declarations and
writes `.tgz` files under ignored `dist-packages/`; it does not publish.

Then install and run the fixture:

```powershell
corepack pnpm run sdk:smoke:chat-disabled:install
corepack pnpm run sdk:smoke:chat-disabled
```

These commands are safe for the fixture. They install only local SDK and
contract tarballs plus TypeScript smoke tooling into
`examples/sdk-chat-disabled-smoke/node_modules`, typecheck the isolated package,
run against a fixture-local in-memory `/v1` fetch surface, and scan the fixture
manifest/source for forbidden dependencies, imports, and service-secret
markers.

The smoke covers:

- metadata via `getMetadata()`, where the fake backend advertises reservations
  but omits chat.
- availability via `listAvailability()` to prove core SDK behavior still works
  when chat is disabled.
- `client.chat.createReservationSession()`, `sendMessage()`,
  `streamMessage()`, and `confirmReservation()` preserving the exact
  `chat_module_disabled` body returned by direct raw `fetch` for the same path,
  body, tenant, venue, auth, correlation, and idempotency context.
- tenant, venue, bearer auth, correlation, and idempotency header forwarding.
- forbidden fixture dependency/import checks for provider SDKs, backend chat
  internals, storage adapters, current app paths, React, Next.js, Supabase, and
  service-secret markers.

This fixture does not prove enabled chat JSON responses, enabled chat
streaming events, reservation confirmation semantics, live backend parity, CI
wiring, private/public registry installs, or final backend extraction.
