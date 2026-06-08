# External Consumer Smoke Fixture

This fixture verifies that a clean TypeScript consumer can import only package
names from tarballs generated under `dist-packages/`.

From the repository root, first build the tarballs:

```powershell
corepack pnpm run packages:pack
```

This is safe to run in the current workspace. It builds package declarations
and writes generated tarballs to ignored `dist-packages/`; it does not publish
packages or touch production data.

Then install and run the smoke fixture:

```powershell
Set-Location examples/external-consumer-smoke
corepack pnpm install
corepack pnpm run typecheck
corepack pnpm run smoke
```

These commands are safe for this fixture. They install local tarballs and
declared test dependencies into `examples/external-consumer-smoke/node_modules`,
then run TypeScript type resolution and runtime smoke checks.

The Supabase adapter smoke uses a mocked client. Production Supabase consumers
must apply `sql/create-reservation-atomic.sql` before relying on atomic booking
creation.
