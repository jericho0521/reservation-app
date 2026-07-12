# Final presentation outline

Target: 10–12 minutes plus questions. Keep slides visual and use the live product for the central story.

## Slide and demonstration sequence

| Time | Visual | Speaker point |
| --- | --- | --- |
| 0:00–0:45 | Title and one-sentence problem | Small booking businesses use disconnected web forms, chat, WhatsApp, and staff processes. |
| 0:45–1:30 | Before/after customer-owner journey | This platform publishes one experience and operates every booking channel through one engine. |
| 1:30–2:30 | Architecture slide | Modular packages isolate policy, transport, storage, channels, and UI while preserving one contract. |
| 2:30–4:15 | Live Experience Studio | Select a preset, edit terminology/branding, preview, validate, and publish. |
| 4:15–5:45 | Live public booking | Book a racing simulator and show availability/resource assignment and confirmation. |
| 5:45–7:15 | Live WhatsApp simulation | Ask for a slot, inspect the structured proposal, explicitly confirm, and locate the reservation. |
| 7:15–8:30 | Live unified inbox | Enable staff takeover, reply, and explain automation suppression/audit history. |
| 8:30–9:45 | Live command center and analytics | Connect the reservation to maintenance risk, funnel conversion, service demand, and channel health. |
| 9:45–10:30 | Shared-engine proof slide | Compare racing, rooms, and appointments: different strategy/configuration, identical engine/API. |
| 10:30–11:15 | Security and safety slide | Tenant/venue scope, public/owner split, hashed tokens, idempotency, encrypted sessions, no QR logging. |
| 11:15–12:00 | Evaluation/results slide | Summarize automated gates, deterministic reproducibility, limitations, and future production work. |

## Required slides

### Architecture

Use the system diagram from `docs/architecture/final-platform-architecture.md`. Highlight only four layers while speaking: experiences and channels, typed API, shared domain/orchestrator, and tenant-scoped Postgres.

### Shared-engine proof

| Domain | Customer-visible difference | Shared mechanism |
| --- | --- | --- |
| Racing | Assigned simulator, maintenance telemetry | Assigned-resource strategy, availability, atomic create |
| Rooms | Capacity/equipment matching | Hybrid resource strategy, same API and UI journey |
| Appointments | Specialist and duration | Assigned-resource strategy, same confirmation and management flow |

### Security and AI safety

- Owner requests carry authorized tenant and venue scope; public routes expose published projections only.
- Free-form model text cannot create a booking. A structured proposal is rebound and revalidated after explicit confirmation.
- Reservation mutations are idempotent and database conflicts are checked atomically.
- WhatsApp session payloads are encrypted when a key is configured; QR and credentials are excluded from logs.

### Evaluation and results

- Eight presets create, validate, preview, and publish; three have complete domain demonstrations.
- Four deterministic presentation-critical e2e journeys pass after a guarded demo reset.
- Package, frontend, migration, deployment, secret, and tenant-boundary gates are automated.
- Live external-provider availability is intentionally separated from platform-owned correctness.

## Prepared examiner answers

### Why Baileys instead of WhatsApp Cloud API?

Baileys makes a linked-device prototype possible without Meta business onboarding, which is useful for a final-year demonstration. The trade-off is that it is unofficial and can break when WhatsApp Web changes. The platform therefore isolates it behind a channel adapter, encrypts persisted session metadata when configured, suppresses sensitive logging, and keeps deterministic simulation as the guaranteed proof. A commercial deployment should evaluate the official Cloud API.

### Why are the modular packages valuable if users see a dashboard?

The dashboard proves the packages compose into a product. Package boundaries let availability rules, contracts, SDK clients, persistence, conversational flows, and UI be tested and replaced independently. The three domain examples demonstrate reuse concretely: they change configuration, strategy, and presentation without cloning reservation logic.

### How is tenant isolation enforced?

Owner context is authorized before protected handlers run; repository queries and analytics/operations RPCs require tenant and venue; public routes resolve only published slug projections. Negative tests attempt cross-scope reads, and frontend boundaries prevent service credentials from entering browser code.

### How do you stop an AI hallucination from creating the wrong booking?

The model can help interpret intent, but it produces a structured proposal rather than a database mutation. The user must explicitly confirm. The server then binds the exact service, resource, and slot to current platform data, rechecks availability, and performs an idempotent atomic create. Manual takeover suppresses subsequent automation.

### What prevents double booking?

Availability previews are advisory. At confirmation, the database operation locks the relevant booking scope, checks overlaps and maintenance again, and inserts atomically. Competing requests produce one confirmed reservation and one conflict response; idempotency prevents client retries from duplicating the winner.

### Why only three polished domains if there are eight presets?

The project demonstrates breadth through one generic configurable model and depth through three meaningfully different resource strategies. Building eight custom vertical products would dilute validation, accessibility, security, and operational polish. The five remaining presets prove Studio lifecycle compatibility and are explicit future visual-specialization work.

### What would you add for production?

Official provider onboarding, payments, monitoring/alerting, backups and disaster recovery, load/security testing, production RLS proof, deployed accessibility testing, and organization-level identity administration. These are documented non-goals rather than partially complete claims.
