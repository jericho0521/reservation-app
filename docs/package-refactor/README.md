# Plug-And-Play Package Refactor Plan

This plan turns the internal reservation module into a workspace package that can later become a drop-in npm package or app plugin.

The selected first target is:

- Workspace package first, inside this repository.
- Headless core first, with no React, Next.js, or Supabase dependency.
- Official Supabase adapter package second.
- Current app remains the reference host application.

## Phase Files

- [Phase 0: Package Boundary Audit](phase-0-package-boundary-audit.md)
- [Phase 1: Workspace Scaffold](phase-1-workspace-scaffold.md)
- [Phase 2: Headless Core Extraction](phase-2-headless-core-extraction.md)
- [Phase 3: Supabase Adapter](phase-3-supabase-adapter.md)
- [Phase 4: Host App Integration](phase-4-host-app-integration.md)
- [Phase 5: Examples and Fixtures](phase-5-examples-and-fixtures.md)
- [Phase 6: Package Hardening](phase-6-package-hardening.md)
- [Remaining Work Overview](remaining-work.md)
- [Phase 7: Atomic Booking RPC](phase-7-atomic-booking-rpc.md)
- [Phase 8: Package Identity and Release Workflow](phase-8-package-identity-release-workflow.md)
- [Phase 9: External Consumer Smoke Test](phase-9-external-consumer-smoke-test.md)
- [Phase 10: Plugin Host Contract](phase-10-plugin-host-contract.md)
- [Plugin Host Contract](plugin-host-contract.md)
- [Phase 11: Optional Host Service Helpers](phase-11-host-service-helpers.md)
- [Phase 12: Optional Framework Adapter Proposals](phase-12-framework-adapter-proposals.md)
- [Subagent Template](subagent-template.md)
- [Handoff Checklist](handoff-checklist.md)

## Package Goal

The outcome is not just "modular inside this app." The outcome is a reservation system that another app can install and use without copying the racing simulator frontend or this Next.js route structure.

The first reusable surfaces should be:

- `@project-play/reservations-core`: framework-agnostic TypeScript package.
- `@project-play/reservations-supabase`: Supabase adapter package using the core contracts.

Names can change later, but every phase should use these names until an intentional downstream update changes them.

## Change Propagation Rule

If a phase changes package names, public exports, table names, adapter interfaces, route expectations, or test strategy, the same change must review all later phase docs and update affected assumptions before the next phase is assigned.

Use this workflow:

1. Update the phase file where the decision changed.
2. Search later phase files for the old decision.
3. Update downstream `Upstream Dependencies`, `Deliverables`, and `Acceptance Criteria`.
4. Record unaffected downstream phases in the changed phase notes.

## Subagent Execution Rules

Each phase is designed for one worker subagent. Workers should receive the full phase text and should not be asked to infer missing scope from chat history.

For every subagent task:

- Provide the phase file content.
- Provide relevant current files from `docs/package-refactor`,
  `packages/reservations-core`, `packages/reservations-supabase`, and host app
  routes only when the phase explicitly needs them.
- Enforce the phase's `Allowed Write Scope`.
- Tell the worker not to edit downstream phase files unless the phase's
  `Downstream Update Requirements` or the change propagation rule explicitly
  requires those updates.
- Require final status: `DONE`, `DONE_WITH_CONCERNS`, or `BLOCKED`.

## Non-Goals For First Package Pass

- Do not publish to npm yet.
- Do not build a full embeddable booking widget yet.
- Do not move app-specific landing pages, chat UI, analytics dashboards, or admin UI into packages.
- Do not make the core package depend on Supabase.
- Do not remove the current app's compatibility API fields until the host app is fully migrated.

## Current Status

Phases 0 through 6 created the package structure and proved that the current
app can consume the package boundaries. The remaining phases are about turning
that workspace package into a real drop-in dependency for other apps:

- Preserve and verify the Supabase atomic booking RPC setup in release and
  external consumer workflows.
- Finalize package names, ownership, and release automation.
- Prove installation from a clean external app.
- Define the optional plugin contract for apps that want a prebuilt host layer.
- Defer implementation of host service helpers and framework adapters to
  explicit follow-up phases.
