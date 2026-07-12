# Final platform architecture

## Purpose

The Reservation Experience Platform separates reusable reservation rules from presentation and channel adapters. A venue can publish one configuration and offer it through visual web booking, AI chat, and WhatsApp while every confirmed booking uses the same availability and atomic reservation path.

## System view

```mermaid
flowchart LR
  Customer["Customer"] --> PublicWeb["Published booking experience"]
  Customer --> Chat["Web AI chat"]
  Customer --> WhatsApp["WhatsApp or deterministic simulation"]
  Owner["Business owner or staff"] --> Console["Experience Studio and operations console"]

  PublicWeb --> Frontend["React hooks and reusable UI"]
  Frontend --> SDK["Type-safe SDK"]
  Chat --> API["Standalone /v1 API"]
  WhatsApp --> Channel["WhatsApp channel adapter"]
  Console --> SDK
  SDK --> API
  Channel --> Orchestrator["Shared conversational booking orchestrator"]
  API --> Orchestrator
  API --> Domain["Reservation domain and platform modules"]
  Orchestrator --> Domain
  Domain --> Adapter["Supabase repository adapter"]
  Adapter --> DB[("Postgres / Supabase")]
  API --> AI["Optional AI provider"]
```

The browser receives only published configuration and public reservation data. Owner operations require authenticated tenant and venue context. Database credentials, AI keys, WhatsApp session material, and service keys remain in backend runtime configuration.

## Package responsibilities

| Layer | Responsibility |
| --- | --- |
| `apps/api` | Runtime composition, environment validation, HTTP server, provider wiring |
| `apps/console` | Server-authenticated Studio, unified inbox, operations, reservations, resources, analytics |
| `apps/booking` and `apps/examples/*` | Public booking shells using browser-safe configuration |
| `packages/reservations-core` | Availability, capacity, resource assignment, overlap, and reservation rules |
| `packages/reservation-platform-api` | Framework-neutral route handling, authorization, idempotency, public/owner mapping |
| `packages/reservations-supabase` | Tenant-scoped persistence and atomic Postgres operations |
| `packages/database` | Ordered migrations, indexes, and deterministic seeds |
| `packages/contract-types` | DTOs, validation schemas, and generated OpenAPI contract |
| `packages/sdk` | Typed client for public and authenticated platform routes |
| `packages/reservation-react` / `reservation-ui` | Headless state and reusable public booking components |
| `packages/ai-chat` / `reservation-chat-core` | Provider-neutral proposal, confirmation, and booking workflow |
| `packages/whatsapp` | Channel session, simulation, staff takeover, encrypted credential persistence |

## Confirmed booking sequence

```mermaid
sequenceDiagram
  actor Customer
  participant Channel as "Web, chat, or WhatsApp"
  participant API as "/v1 API"
  participant Flow as "Shared booking orchestrator"
  participant Rules as "Availability and reservation domain"
  participant DB as "Postgres"

  Customer->>Channel: Choose service, date, and preferences
  Channel->>API: Request current availability
  API->>Rules: Calculate valid slots and resources
  Rules->>DB: Read schedules, bookings, and maintenance
  DB-->>Rules: Scoped availability inputs
  Rules-->>Channel: Offer valid choices
  Customer->>Channel: Explicitly confirm proposal
  Channel->>Flow: Confirm exact proposal with idempotency key
  Flow->>Rules: Rebind service, slot, and resource
  Rules->>DB: Atomic conflict check and insert
  alt Slot remains available
    DB-->>Rules: Confirmed reservation and management token hash
    Rules-->>Channel: Confirmation and safe management link
  else Concurrent claim or maintenance conflict
    DB-->>Rules: Conflict
    Rules-->>Channel: Safe retry response with fresh availability
  end
```

No conversational channel writes a reservation from free-form model output. The platform stores a structured proposal, requires explicit confirmation, revalidates the exact selection, and uses the same atomic mutation as visual booking.

## Experience Studio lifecycle

```mermaid
stateDiagram-v2
  [*] --> PresetSelected
  PresetSelected --> Draft: "Create editable foundation"
  Draft --> Draft: "Save profile, branding, services, resources, availability, knowledge, channels"
  Draft --> Preview: "Render shared customer components"
  Preview --> Draft: "Correct validation issues"
  Preview --> Validated: "All publish checks pass"
  Validated --> Published: "Confirm and publish immutable version"
  Published --> Draft: "Create next editable revision"
  Published --> Archived: "Retire public experience"
  Archived --> Draft: "Restore as new revision"
```

The published version is isolated from subsequent draft edits. Public routes resolve only a published slug and expose a browser-safe projection, so an owner can prepare the next revision without changing the live customer experience.

## Deployment view

```mermaid
flowchart TB
  Browser["Customer or owner browser"] -->|"HTTPS"| Web["Booking apps and owner console"]
  Web -->|"HTTPS /v1"| API["Standalone Node API container"]
  Provider["Optional AI provider"] <-->|"Backend-only HTTPS"| API
  WA["WhatsApp linked-device session"] <-->|"Backend-only session"| API
  API -->|"TLS + scoped queries / RPC"| Supabase["Supabase Postgres"]
  Secrets["Deployment secret store"] --> API
  Migrations["Versioned migration bundle"] --> Supabase
  Seed["Guarded final-demo reset"] -.->|"Disposable demo only"| Supabase
```

The API can run in memory for local smoke work, but the final multi-tenant feature set requires migrated Postgres. Deployments must run `pnpm deploy:verify`, apply the indexed migration bundle in order, configure CORS and owner authentication, and keep all secret-bearing values out of frontend environments.

## Live integrations and deterministic simulation

| Capability | Live mode | Deterministic demonstration mode |
| --- | --- | --- |
| Database | Supabase/Postgres with migrations `000001`–`000020` | Same schema with guarded `final_demo` seed; validation-only without a URL |
| AI | OpenAI-compatible provider configured in backend env | Rule-driven structured booking responses |
| WhatsApp | Baileys linked-device session with encrypted credential payload when a key is set | Credential-free channel adapter using the same orchestrator and persistence |
| Realtime | Polling/read refresh against owner API | Same behavior over seeded data |

## Deliberate non-goals and limitations

- This is a broad platform demonstration, not a production marketplace, payment processor, or enterprise workforce scheduler.
- Only racing simulators, rooms, and appointments receive domain-specific visual polish. The other five presets prove the shared model.
- Baileys is an unofficial WhatsApp Web integration and may change upstream; simulation is the guaranteed presentation path.
- Analytics are operational aggregates, not a general business-intelligence warehouse.
- Final production assurance still requires deployed accessibility review, database RLS proof, load testing, monitoring, backups, and incident procedures in the target environment.
