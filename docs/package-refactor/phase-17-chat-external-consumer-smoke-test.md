# Phase 17: Chat External Consumer Smoke Test

## Goal

Prove that a clean external app can install and run the reusable chat workflow
without importing this app's `lib/`, `app/`, or `components/` directories.

## Read First

- `docs/package-refactor/phase-14-headless-chat-core-package.md`
- `docs/package-refactor/phase-15-reservation-chat-tools.md`
- `docs/package-refactor/phase-16-host-chat-integration.md`
- `examples/external-consumer-smoke/**`
- Package READMEs

## Allowed Write Scope

- `examples/**`
- `docs/package-refactor/**`
- Package README files
- Package manifests if missing install metadata is discovered

## Do Not Touch

- Production app chat route
- Chat UI
- Production Supabase data
- Package names unless explicitly assigned

## Work Items

1. Pack reservation and chat packages.
2. Create or extend an external consumer smoke fixture.
3. Install packages from generated tarballs.
4. Run TypeScript typecheck from package declarations.
5. Run a smoke script that:
   - imports chat package roots by package name
   - builds fake reservation repository tools
   - parses a prepared booking action
   - checks configurable domain guard behavior
   - verifies no Next.js, React, Supabase, or host app path is needed for chat
     core usage
6. If a LangChain adapter package exists, verify it with a mocked model/tool
   runner rather than a live provider API.
7. Document exact install and smoke commands.

## Deliverables

- External chat consumer smoke notes.
- Repeatable smoke fixture.
- README updates.
- Manifest fixes if required.

## Acceptance Criteria

- External chat consumer imports package names only.
- TypeScript declarations resolve.
- Core chat smoke does not require Next.js, React, Supabase, OpenRouter, or
  host app code.
- Any LangChain-specific smoke declares LangChain dependencies explicitly.
- Existing reservation external smoke still passes.

## Phase 17 Implementation Notes

Extended `examples/external-consumer-smoke` to install
`@project-play/reservation-chat-core` from the generated tarball alongside the
existing reservation package tarballs.

The fixture now verifies:

- Package-root imports from `@project-play/reservation-chat-core`.
- TypeScript declaration resolution through the external consumer `tsconfig`.
- Fake `ReservationRepository` chat tools for service listing, availability,
  prepared booking, host knowledge, and a host-owned custom directions tool.
- Prepared booking output parsed into a `booking_confirmation` action.
- Invalid availability date handling.
- Invalid knowledge query handling before host retrieval.
- Duplicate tool name construction failure.
- `availability.legacyFallbackLabels` as a host callback for legacy
  assigned-resource availability.
- Configurable domain guard behavior with host-provided allowed topics, blocked
  topics, and fallback copy.
- Prompt section builders with host-provided copy and reservation rules.

No LangChain adapter package exists in this workspace. The Phase 17 smoke
therefore does not install LangChain dependencies or run LangChain-specific
mocked model/tool checks.

Repeatable commands from the repository root:

```powershell
corepack pnpm run packages:pack
Set-Location examples/external-consumer-smoke
$env:CI='true'; corepack pnpm install --config.package-import-method=copy
corepack pnpm run typecheck
corepack pnpm run smoke
```

These commands are safe to run in the current workspace. They build local
tarballs under ignored `dist-packages/`, install local fixture dependencies
under `examples/external-consumer-smoke/node_modules`, and run declaration and
runtime checks only. They do not publish packages, touch production app chat
routes, or access production Supabase data.

`CI=true` was used for non-interactive PowerShell installs. The copy import
mode was used for the verified Windows sandbox install because the default pnpm
hardlink import method produced unreadable chat tarball files after
package-store extraction.

## Phase 14 Contract To Verify

The external smoke fixture should import only from
`@project-play/reservation-chat-core` for headless chat behavior.

Verify:

- `extractPreparedBookingActionFromToolCalls` maps a `prepare_booking` tool call
  to a `booking_confirmation` action.
- `createReservationChatTools` builds fake-repository tools for listing
  services, checking availability, preparing a booking, and adding host custom
  tools without importing host app paths.
- Tool factory smoke should include invalid availability date rejection,
  invalid knowledge query rejection before host retrieval, and duplicate tool
  name construction failure.
- Tool factory smoke should include `availability.legacyFallbackLabels` as a
  static array or service callback so external consumers verify the Phase 16
  legacy assigned-resource availability contract.
- `createDomainGuard` accepts host-provided allowed topics, blocked topics, and
  fallback copy.
- `buildBookingPromptSections` works with host-provided copy and reservation
  rules.
- Package declarations resolve from the package root only.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Install method tested
- Chat examples tested
- Package contract changes
- Remaining risks
