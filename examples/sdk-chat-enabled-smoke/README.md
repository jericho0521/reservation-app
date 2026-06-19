# Reservation Platform SDK Enabled Chat Smoke

This fixture proves that an external consumer can use the public SDK chat
namespace against an enabled `/v1/chat` backend shape without importing
LangChain, provider SDKs, Supabase, Next.js, the current Project Play app, or
the current React chat UI.

It uses a fixture-local fake HTTP backend, not the current app routes. The
smoke compares SDK calls with direct HTTP for metadata, session creation,
message JSON responses with public action/prepared-reservation metadata,
streaming NDJSON/text chunks, and confirmation responses with a public
reservation response shape.

From the repository root, `corepack pnpm run sdk:smoke:chat-enabled:install`
installs the fixture from local package tarballs, and
`corepack pnpm run sdk:smoke:chat-enabled` typechecks and runs the smoke. Both
commands are safe for this workspace: they operate inside this fixture and do
not publish packages or call a live backend.

This does not prove a real provider workflow, retrieval adapter, checkpoint
store, or live seeded backend deployment.
