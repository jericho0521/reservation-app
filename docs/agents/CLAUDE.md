# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands use **pnpm** (pnpm-lock.yaml is canonical; CI uses pnpm).

```bash
pnpm dev          # Dev server on http://localhost:4000
pnpm build        # Production build
pnpm lint         # ESLint (Next.js core web vitals + TypeScript rules)
pnpm test         # Node built-in test runner via tsx
pnpm pr           # Push branch + open PR via scripts/pr.mjs
pnpm seed:knowledge   # Re-embed data/knowledge.md into pgvector
pnpm local:supabase:start  # Start local Supabase (PowerShell)
pnpm local:supabase:stop   # Stop local Supabase
```

**Running a single test:** `node --import tsx --test <path/to/file.test.ts>`

**Adding a new test file:** Explicitly add the path to the `test` script in `package.json` — the runner does not auto-discover.

## Architecture

### Two booking paths

1. **Form booking** (`app/form-booking/`) — multi-step form → `/api/availability` → `/api/bookings`
2. **AI chat booking** (`app/chat-booking/`) — chat UI → `/api/chat` → LangGraph ReAct agent → booking confirmation card → user confirms → DB insert

### Core business logic in `lib/`

| File | Responsibility |
|---|---|
| `availability.ts` | Time slot generation, seat availability calculation |
| `reservation-capacity.ts` | Booking conflict detection, seat label management (RS1–RS16) |
| `seat-maintenance.ts` | Which seats are blocked for maintenance |
| `langchain/chat-agent.ts` | ReAct agent with `getServices`, `getAvailability`, `prepareBooking` tools |
| `langchain/sales-report-pipeline.ts` | LangGraph pipeline: PDF/image upload → Gemini extraction → normalized `daily_sales_reports` |
| `langchain/analytics-agent.ts` | Generates dashboard spec JSON from booking + sales data |
| `supabase-admin.ts` | Service-role client (server only, bypasses RLS) |
| `supabase-server.ts` | SSR client with cookie-based session |
| `supabase-browser.ts` | Client-side auth client |

### API layer (`app/api/`)

Each route folder contains `route.ts`. Auth helpers live in `app/api/api-utils.ts`:
- `requireAuthenticatedSupabase()` — returns 401 if no valid session; used in booking reads and all analytics endpoints.

### Database (Supabase + Postgres)

Core tables: `services`, `venues`, `bookings`, `service_seat_maintenance`, `admin_users`.
AI tables: `knowledge_chunks` (pgvector, 768-dim Gemini embeddings), `sales_report_documents`, `daily_sales_reports`.

Admin identity is determined by presence in `admin_users`, checked via `public.is_admin()` SQL function. Service-role key bypasses RLS; never expose it client-side.

Knowledge base is seeded from `data/knowledge.md` via `pnpm seed:knowledge`. Re-run after editing that file.

### AI stack

- **Chat agent**: LangChain/LangGraph ReAct agent, OpenRouter Gemini model
- **Embeddings**: Google Gemini (`text-embedding-004`, 768-dim)
- **RAG**: Supabase pgvector + `match_knowledge` RPC for similarity search
- **Streaming**: Vercel AI SDK (`ai` v6) for chat UI
- **Analytics dashboards**: agent generates a spec JSON; `components/analytics/renderer/` renders it dynamically

### Branching

Feature branches → `staging` → `master`. PRs from feature branches target `staging`.

## Coding Conventions

- Use the `@/*` path alias for all root-relative imports.
- Next.js file conventions: `page.tsx`, `layout.tsx`, `route.ts`.
- PascalCase for React components, camelCase for functions/variables.
- Two-space indentation, double-quote string literals.
- Tests live next to the code they cover: `lib/foo.ts` → `lib/foo.test.ts`.

## Required Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_GENERATIVE_AI_API_KEY
OPENROUTER_API_KEY
```
