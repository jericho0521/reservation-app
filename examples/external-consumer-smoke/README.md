# Legacy External Consumer Smoke Fixture

This legacy fixture verifies that a clean TypeScript consumer can import the old
`@project-play/*` package names from tarballs generated under `dist-packages/`.
It covers both the reservation packages and the legacy headless chat core
package.

This is superseded as the current external consumer proof. Use the
`examples/sdk-*` fixtures for active `@reservation-platform/sdk` coverage,
including SDK chat-enabled and chat-disabled examples.

From the repository root, first build the tarballs:

```powershell
corepack pnpm run packages:pack
```

This is safe to run in the current workspace. It builds package declarations
and writes generated tarballs to ignored `dist-packages/`; it does not publish
packages or touch production data.

Then install and run the legacy smoke fixture:

```powershell
Set-Location examples/external-consumer-smoke
$env:CI='true'; corepack pnpm install --config.package-import-method=copy
corepack pnpm run typecheck
corepack pnpm run smoke
```

These commands are safe for this fixture. They install local tarballs and
declared test dependencies into `examples/external-consumer-smoke/node_modules`,
then run TypeScript type resolution and runtime smoke checks. `CI=true` lets
pnpm proceed non-interactively when recreating this fixture's `node_modules`.
The copy import mode keeps local tarball files readable on Windows sandboxed
installs that may otherwise preserve restrictive store hardlink permissions.

The legacy chat smoke imports only package roots:

- `@project-play/reservation-chat-core`
- `@project-play/reservations-core`

It builds fake repository-backed chat tools, parses a prepared booking action,
checks host-configurable domain guard behavior, and verifies prompt builders.
The headless chat checks do not require Next.js, React, Supabase, OpenRouter,
LangChain, or host app source paths. New SDK consumer proofs should not use this
fixture as evidence for current external chat packaging.

The Supabase adapter smoke uses a mocked client. Production Supabase consumers
must apply `sql/create-reservation-atomic.sql` before relying on atomic booking
creation.
