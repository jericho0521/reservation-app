# Documentation

This directory documents the backend-only modular reservation platform branch.
The current product surface is the standalone `/v1` backend API, backend-owned
database bundle, public contract packages, and SDK.

## Naming Convention

Use lowercase kebab-case for normal documentation files:

```text
backend-deployment.md
local-supabase-runbook.md
phase-1-backend-platform-contract.md
```

Keep conventional special files uppercase when they are meant to be discovered
by tools or repository conventions:

```text
README.md
AGENTS.md
CLAUDE.md
```

Planning folders may keep their existing names when scripts, manifests, or
cross-linked phase docs depend on them. Prefer adding an index instead of moving
large historical plan trees.

## Start Here

| Goal | Document |
| --- | --- |
| Understand the backend product branch | [Repository README](../README.md) |
| Implement or operate backend modules | [Backend Modules Developer and User Manual](manuals/backend-modules-dev-user-manual.html) |
| Deploy or run the backend container | [Operations: Backend Deployment](operations/backend-deployment.md) |
| Understand the public API and SDK contract | [Package Refactor Overview](package-refactor/README.md) |
| Continue backend extraction work | [Backend Platform Extraction](package-refactor/backend-platform-extraction/README.md) |
| Review remaining modularity gaps | [Remaining Modularity Gaps](package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/remaining-modularity-gaps.md) |
| Explain the final-year-project direction | [FYP Modular Booking Platform](fyp-modular-booking-platform/README.md) |

## Current Documentation Areas

| Area | Path | Purpose |
| --- | --- | --- |
| Operations | [operations](operations) | Deployment, hosting URLs, and restart runbooks. |
| Manuals | [manuals](manuals) | Long-form developer and user manuals. |
| Supabase | [supabase](supabase) | Local/self-hosted Supabase setup and troubleshooting notes. |
| Backend platform plans | [package-refactor/backend-platform-extraction](package-refactor/backend-platform-extraction) | Backend product boundary, contracts, SDK readiness, and extraction manifests. |
| Agents | [agents](agents) | Repository instructions for coding agents. |

## Documentation Hygiene

- Put runnable backend operations docs under `docs/operations/`.
- Put Supabase-specific setup docs under `docs/supabase/`.
- Put phase plans beside the phase index they belong to.
- Update any README index when adding a new long-lived document.
- Avoid adding frontend setup as a backend requirement. Frontends should connect
  through `/v1` or `@reservation-platform/sdk`.
