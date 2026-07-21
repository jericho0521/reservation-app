# Final platform architecture

## Purpose

The Reservation Experience Platform is a Docker-first, single-business
appointment product built from reusable reservation modules. One installation
publishes one business through visual web booking, AI-assisted chat, and
WhatsApp while every confirmed booking uses the same availability and atomic
reservation path. Tenant and venue scoping remain enforced internally so the
modules and data model stay safe and reusable.

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
  WhatsApp --> Worker["Background worker"]
  Console --> SDK
  SDK --> API
  Worker --> Orchestrator["Shared conversational booking orchestrator"]
  API --> Jobs["Durable job queue"]
  Jobs --> Worker
  Worker --> Retrieval["Hybrid lexical and vector retrieval"]
  Retrieval --> DB
  Worker --> Orchestrator
  API --> Domain["Reservation domain and platform modules"]
  Orchestrator --> Domain
  Domain --> Adapter["Supabase repository adapter"]
  Adapter --> DB[("Postgres / Supabase")]
  Worker --> AI["Optional BYOK AI provider"]
```

The browser receives only published configuration and public reservation data.
Owner operations require authenticated tenant and venue context. Database
credentials and installation secrets remain in generated server configuration;
AI, email, and WhatsApp credentials are entered through owner settings, stored
encrypted, and used only by backend containers.

## Package responsibilities

| Layer | Responsibility |
| --- | --- |
| `apps/api` | Runtime composition, environment validation, HTTP server, provider wiring |
| `apps/worker` | Durable jobs, knowledge indexing, local embeddings, retrieval, notifications, conversation processing, and WhatsApp work |
| `apps/console` | Server-authenticated Studio, unified inbox, operations, reservations, resources, analytics |
| `apps/booking` and `apps/examples/*` | Public booking shells using browser-safe configuration |
| `packages/reservations-core` | Availability, capacity, resource assignment, overlap, and reservation rules |
| `packages/reservation-platform-api` | Framework-neutral route handling, authorization, idempotency, public/owner mapping |
| `packages/reservations-supabase` | Tenant-scoped persistence and atomic Postgres operations |
| `packages/database` | Ordered migrations through `000040`, indexes, and guarded deterministic seeds |
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
  API --> Queue["Durable jobs"]
  Queue --> Worker["Background worker container"]
  Provider["Optional BYOK AI provider"] <-->|"Backend-only HTTPS"| Worker
  WA["Baileys linked-device session"] <-->|"Encrypted session"| Worker
  API -->|"Private scoped queries / RPC"| Postgres["Postgres + pgvector"]
  Worker -->|"Private scoped queries / RPC"| Postgres
  Model["Bundled multilingual embedding model"] --> Worker
  Secrets["Generated installation configuration"] --> API
  Secrets --> Worker
  Migrations["Indexed migrations 000001-000040"] --> Postgres
  Seed["Explicit demo override"] -.->|"Separate demo volumes"| Postgres
```

The default Compose stack starts a blank product installation and creates its
first owner through browser setup. The explicit demo override uses separate
Compose state and guarded seeds. Production uses the same one-business model,
applies the indexed migration bundle in order, and keeps database and integration
credentials off the browser and ordinary logs. In-memory mode remains a
development-only smoke harness.

## Live integrations and deterministic simulation

| Capability | Live mode | Deterministic demonstration mode |
| --- | --- | --- |
| Database | PostgreSQL/pgvector with migrations `000001`–`000040` | Same schema with explicit, isolated demo seed |
| AI and retrieval | Owner-configured BYOK generation plus local hybrid retrieval over indexed FAQs, text, and PDFs | Deterministic FAQ and structured booking fallback without provider credentials |
| WhatsApp | Baileys linked-device session with encrypted credential payload when a key is set | Credential-free channel adapter using the same orchestrator and persistence |
| Email | Owner-configured SMTP with encrypted credentials and durable delivery jobs | Manual invitation fallback when SMTP is absent |
| Realtime | Polling/read refresh against owner API | Same behavior over isolated demo data |

## Deliberate non-goals and limitations

- This is a self-hosted appointment platform, not a marketplace, payment processor, native mobile application, or enterprise workforce scheduler.
- Industry presets configure booking semantics and terminology. Selectable visual design presets are a separate future extension.
- Baileys is an unofficial WhatsApp Web integration and may change upstream; simulation is the guaranteed presentation path.
- Analytics are operational aggregates, not a general business-intelligence warehouse.
- Final production assurance still requires deployed accessibility review, database RLS proof, load testing, monitoring, backups, and incident procedures in the target environment.
