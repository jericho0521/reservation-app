# Final demonstration runbook

## Goal

Demonstrate one coherent platform story in 10–12 minutes: configure a business, accept a reservation through shared infrastructure, intervene in an AI conversation, and use operations data to make a decision.

## Prepare the environment

1. Install with `pnpm install --frozen-lockfile`.
2. Apply migrations `000001`–`000020` to a disposable database.
3. Configure the backend and owner-console server variables described in the root README.
4. Reset and verify deterministic data using the guarded commands in `final-demo-environment.md`.
5. Run `pnpm test:e2e`, `pnpm deploy:verify`, and `pnpm demo:verify`.
6. Start the API, owner console, and the three flagship public experiences.
7. Open all required tabs before presenting and confirm browser zoom, audio, and network state.

Use WhatsApp simulation as the primary guaranteed path. A live Baileys session is an optional enhancement, not a dependency of the assessed journey.

## Demonstration sequence

| Time | Action | Point to make |
| --- | --- | --- |
| 0:00–1:00 | Open the owner command center | The project is an operational product, not only backend packages. |
| 1:00–3:00 | Enter Studio, choose a preset, change brand/terminology, preview, validate, and publish | Eight domains share one configuration lifecycle; three are polished flagships. |
| 3:00–5:00 | Open the published racing experience, choose a slot/resource, and confirm | Public UI uses shared availability and the atomic reservation engine. |
| 5:00–7:00 | Run WhatsApp simulation, request a booking, and explicitly confirm the proposal | Conversation channels cannot bypass validation or confirmation. |
| 7:00–8:30 | Open the unified conversation, enable staff takeover, and send a reply | Staff control suppresses automation and preserves an auditable timeline. |
| 8:30–10:00 | Find the reservation, inspect a maintenance conflict, and open analytics | Owners can move from customer interaction to daily operations and demand insight. |
| 10:00–11:00 | Briefly show rooms and appointments | Different resource strategies use the same engine without copied backends. |
| 11:00–12:00 | Close on architecture and verification evidence | Modular design serves a visible user story and remains testable and extractable. |

## Evidence to keep ready

- `docs/architecture/final-platform-architecture.md`
- `docs/evaluation/requirements-traceability.md`
- The latest full release-candidate command output
- Migration index and deterministic demo readiness output
- `docs/security/final-security-review.md`

## Success criteria

- A published customer experience is visibly derived from Studio configuration.
- At least one reservation reaches confirmed state through the shared engine.
- Staff takeover visibly prevents automated delivery.
- The same seeded activity appears in operations and analytics.
- No secrets, raw QR payloads, or private identifiers appear on screen or in logs.
