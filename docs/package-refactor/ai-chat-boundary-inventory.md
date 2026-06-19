# AI Chat Boundary Inventory

## Status

This file is retained as historical/source inventory for the modularity work.
It is not the active roadmap.

The active direction keeps LangChain, provider clients, retrieval, and tool
orchestration inside the backend platform. External frontends use direct HTTP
or the optional SDK chat namespace:

- [Backend Platform Phase 6: AI Chat Backend Service Contract](backend-platform-extraction/phase-6-ai-chat-backend-service-contract.md)
- [SDK Readiness Phase 6: Optional Chat SDK Namespace](backend-platform-extraction/sdk-readiness/phase-6-optional-chat-sdk.md)

Older references in this file to Phase 13 through Phase 17, direct chat package
consumption, or `@project-play/*` chat packages are preserved only to explain
the original boundary audit. If this inventory conflicts with the
backend-platform documents, the backend-platform documents win.

## Historical Inventory

Phase 13 audits the current LangChain booking chat workflow for extraction into
optional reusable chat packages. This is a documentation-only inventory. No
runtime behavior changed.

## Decision Summary

The reusable package should own only framework-neutral booking chat contracts:

- Chat message and action payload types.
- Prepared booking payload parsing.
- Configurable domain guard helpers.
- Prompt section builders that accept host copy, date, and reservation rules.
- Tool contract types for listing services, checking availability, and preparing
  a host-confirmed booking.

The package must not own Project Play venue data, chat UI rendering, Next.js
route behavior, Supabase clients, model provider setup, vector-store setup, or
final booking creation.

## Current Workflow

1. `components/chat/useChat.ts` sends `{ messages, threadId }` to
   `POST /api/chat`.
2. `app/api/chat/route.ts` handles confirmation payloads first, then domain
   guard, then location action, then knowledge retrieval, then agent execution.
3. `lib/knowledge.ts` retrieves relevant business context from the Supabase
   vector store in `lib/langchain/vector-store.ts`.
4. `lib/langchain/chat-agent.ts` builds a LangGraph ReAct agent with
   `get_services`, `check_availability`, and `prepare_booking`.
5. The agent uses `buildBookingSystemPromptWithContext(context)` and a
   `thread_id` checkpoint key.
6. `extractPreparedBookingAction` turns the latest `prepare_booking` tool call
   or tool result into a `booking_confirmation` action.
7. The chat UI renders the booking card. The final booking is created only when
   the user posts `confirmBooking` back to the host route.
8. Successful confirmation returns a `booking_success` action payload, although
   the current `useChat` confirmation flow only appends `result.content`.

## Dependency Classification

| Dependency or surface | Current file | Owner for extraction | Notes |
| --- | --- | --- | --- |
| `ChatMessage` `{ role, content }` | `lib/langchain/chat-agent.ts`, `components/chat/chat-types.ts` | Package-owned | Pure serializable contract. Keep roles as `"user" | "assistant"` unless the current backend chat contract adds an extension point. |
| `BookingData` / `BookingAction` | `lib/langchain/chat-agent.ts`, `components/chat/chat-types.ts`, `app/api/chat/tool-loop.ts` | Package-owned | Reusable booking action payload. Current fields are `service`, `date`, `time`, `seats`, `name`, `email`, `phone`. |
| `booking_confirmation` action type | same as above | Package-owned | Emitted when `prepare_booking` has complete user-provided details. |
| `booking_success` action type | `app/api/chat/route.ts`, `components/chat/chat-types.ts` | Package-owned contract, host-produced event | Reusable action name and payload shape, but final creation stays host-owned. |
| `location_directions` action type | `lib/langchain/chat-agent.ts`, `components/chat/chat-types.ts` | Host-owned by default; package may allow custom action extension | Contains venue coordinates, map URLs, and navigation copy. Do not bake into reusable package. |
| `extractPreparedBookingAction` for LangChain messages | `lib/langchain/chat-agent.ts` | Adapter-owned if it imports LangChain message classes | Pure payload validation is package-owned; LangChain `AIMessage`, `HumanMessage`, and `ToolMessage` traversal belongs in a LangChain adapter. |
| `extractPreparedBookingAction` for OpenAI-style tool calls | `app/api/chat/tool-loop.ts` | Package-owned or adapter-owned | Parsing JSON args into the same action is pure. The `ToolCall` shape may be a lightweight package type. |
| `resolveToolCalls` | `app/api/chat/tool-loop.ts` | Adapter-owned | Generic tool-call loop helper, but tied to OpenAI-style `tool_call_id` messages. Candidate for an optional adapter, not core requirement. |
| `getChatDomainGuardResponse` | `lib/langchain/chat-agent.ts` | Package-owned behavior with host-provided config | Regex matching and fallback flow are reusable; topic patterns and Project Play copy are host inputs. |
| `getLocationDirectionsAction` | `lib/langchain/chat-agent.ts` | Host-owned | Project Play-specific route shortcut and card data. Package can support custom actions but should not include this one as a built-in reservation contract. |
| `BOOKING_SYSTEM_TEMPLATE` and prompt builders | `lib/langchain/prompts.ts`, `app/api/chat/chat-config.ts` | Mixed | Generic booking rules are package-owned prompt sections. Project Play name, support scope, operating hours, time zone, and business context labels are host-owned inputs. |
| Malaysia date helper | `app/api/chat/chat-config.ts`, `lib/langchain/prompts.ts` | Host-owned input | Package should accept `today` or a clock/date provider, not hardcode `Asia/Kuala_Lumpur`. |
| LangGraph ReAct agent creation | `lib/langchain/chat-agent.ts` | Adapter-owned | `createReactAgent` and `MemorySaver` are LangChain/LangGraph adapter concerns. Core must not depend on them. |
| Model factories | `lib/langchain/models.ts` | Host-owned | OpenRouter/Gemini choices, API keys, headers, temperature, token limits, and environment variables stay in host app. |
| Knowledge retriever | `lib/knowledge.ts`, `lib/langchain/vector-store.ts` | Host-owned input | Package may accept a retriever function. Supabase vector store, Google embeddings, table name, RPC name, and error logging stay host-owned. |
| Next.js chat route | `app/api/chat/route.ts` | Host-owned | Request parsing, HTTP status, `NextResponse`, `crypto.randomUUID`, confirmation endpoint behavior, and user-facing error text stay in host integration. |
| Zod confirmation schema | `app/api/chat/route.ts` | Package-owned payload type, host-owned validation surface | Current backend chat contract work can export schema-free types or optional validators. Route status and messages stay host-owned. |
| Chat UI components and hook | `components/chat/**` | Host-owned | Rendering, pending/confirmed/cancelled/loading state, fetch behavior, and copy stay out of package. |
| `@/lib/supabase` and `@/lib/supabase-admin` | `lib/langchain/chat-agent.ts`, `lib/langchain/vector-store.ts` | Host-owned / repository adapter-owned | Core package must not import host clients. Reservation tool factories should accept repository functions. |
| `@/lib/availability` and `@/lib/reservation-capacity` | `lib/langchain/chat-agent.ts` | Package-adjacent reservation core | Chat tools should call `@project-play/reservations-core` availability helpers through repository-backed service data. |
| Supabase table names and row shapes | `lib/langchain/chat-agent.ts`, `lib/langchain/vector-store.ts` | Adapter-owned | Existing Supabase adapter already documents reservation table constants. Chat core should not know table names. |

## Project Play-Specific Concerns

Keep these in the host app:

- Business name: `PROJECT PLAY by CW` / `Project Play by CW`.
- Domain guard fallback copy:
  `"I can help with Project Play bookings, services, availability, pricing, policies, and venue information. What would you like to book or ask about Project Play?"`
- Prompt scope: Project Play bookings, services, games, policies, venue
  information, pricing, rules, FAQs, equipment, support.
- Location data:
  - `Project Play By CW, 70, Jalan PJS 11/7, Bandar Sunway, 47500 Subang Jaya,
    Selangor`
  - `Bandar Sunway, Subang Jaya`
  - coordinates `{ lat: 3.0660998, lng: 101.6026114 }`
  - Google Maps embed URL, Waze URL, and Google Maps URL.
- Location trigger regex and route shortcut.
- Operating hours copy: `12 PM - 2 AM Malaysia time (1-hour time slots)`.
- Malaysia time zone behavior and natural-language date grounding.
- User-facing confirmation copy, error copy, and cancellation copy.
- Current homepage/UI hints that mention Racing Simulator or PS5.

The reusable package may accept all of the above as configuration, but should
not ship Project Play values as defaults.

## Reusable Action Contracts

### `booking_confirmation`

Produced from `prepare_booking` tool args or tool result.

```ts
{
  type: "booking_confirmation";
  data: {
    service: string;
    date: string;
    time: string;
    seats: number;
    name: string;
    email: string;
    phone: string;
  };
}
```

Current source payload keys are:

- `service_name -> data.service`
- `date -> data.date`
- `start_time -> data.time`
- `seats -> data.seats`
- `user_name -> data.name`
- `user_email -> data.email`
- `user_phone -> data.phone`

The parser rejects payloads missing any field or using the wrong primitive
type. It also ignores prepared bookings from previous turns by scanning only
messages after the latest `HumanMessage`.

### `booking_success`

Produced by the host route after the user confirms the card and `createBooking`
succeeds.

```ts
{
  type: "booking_success";
  data: {
    service: string;
    date: string;
    time: string;
    seats: number;
    name: string;
    email: string;
    phone: string;
  };
}
```

The action name and payload shape are reusable, but the write itself is not.
Final booking creation must remain a host-confirmed operation.

### `location_directions`

Current shape:

```ts
{
  type: "location_directions";
  data: {
    name: string;
    address: string;
    area: string;
    coordinates: { lat: number; lng: number };
    mapEmbedUrl: string;
    wazeUrl: string;
    googleMapsUrl: string;
  };
}
```

This should be treated as a host custom action. Current backend chat contract
work should expose an extension point for host-defined actions rather than
making directions part of the reservation chat core.

## Current Tool Contracts

### `get_services`

Schema:

```ts
z.object({})
```

Description:

`Get the current list of bookable services and their capacity/resource reservation metadata`

Current response shape:

```ts
{
  services?: Array<{
    id: string;
    name: string;
    description?: string | null;
    total_capacity: number;
    resource_kind?: string | null;
    selection_mode?: string | null;
    reservation_policy: unknown;
  }>;
  error?: string;
}
```

Boundary decision:

- Tool name is reusable.
- Tool schema is reusable.
- Response should be normalized from reservation repository service data.
- Current direct `services` table read is adapter/host-owned.

### `check_availability`

Schema:

```ts
z.object({
  service_name: z.string().describe("Name of the bookable service from get_services"),
  date: z.string().describe("Date in YYYY-MM-DD format"),
})
```

Description:

`Check available time slots for any bookable service on a specific date`

Current response shape:

```ts
{
  service_name?: string;
  service_id?: string;
  date?: string;
  total_capacity?: number;
  resource_kind?: string | null;
  selection_mode?: string | null;
  available_slots?: Array<{
    time: string;
    available_seats: number;
  }>;
  error?: "Service not found" | "Booking availability is temporarily unavailable" | string;
}
```

Boundary decision:

- Tool name and broad schema are reusable.
- Current Phase 6 AI chat backend contract and SDK readiness work should decide
  whether `service_name` remains the public tool input or whether tools also
  accept a stable `service_id`. The current prompt tells the model to use
  service names from `get_services`.
- Availability calculation should use repository calls plus
  `generateAvailabilityTimeSlots` from reservation core, not host Supabase
  queries or legacy host helpers.

### `prepare_booking`

Schema:

```ts
z.object({
  service_name: z.string().describe("Name of the bookable service from get_services"),
  date: z.string().describe("Date in YYYY-MM-DD format"),
  start_time: z.string().describe("Start time in HH:MM format"),
  seats: z.number().describe("Booking quantity, such as seats, stations, rooms, or capacity units"),
  user_name: z.string().describe("Customer name"),
  user_email: z.string().describe("Customer email"),
  user_phone: z.string().describe("Customer phone number"),
})
```

Description:

`Prepare a booking for user confirmation. Call this when you have ALL details:
service, date, time, seats, name, email, and phone. This does NOT create the
booking yet - it shows a confirmation card to the user.`

Current response shape:

```ts
{
  ready_for_confirmation: true;
  service_name: string;
  date: string;
  start_time: string;
  seats: number;
  user_name: string;
  user_email: string;
  user_phone: string;
}
```

Boundary decision:

- Tool name, schema, and response shape are reusable.
- It must remain a preparation-only tool.
- It must not create a reservation, send notifications, charge payment, or call
  a host API.

## Route Request And Response Shapes

Current normal chat request:

```ts
{
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  threadId?: string;
}
```

Current confirmation request:

```ts
{
  messages?: [];
  confirmBooking: {
    service: string;
    date: string;
    time: string;
    seats: number;
    name: string;
    email: string;
    phone: string;
  };
  threadId?: string;
}
```

Current successful response:

```ts
{
  content: string;
  action?: ChatAction | null;
  threadId?: string;
}
```

Boundary decision:

- Serializable message and action contracts are reusable.
- HTTP request parsing, status codes, `threadId` generation, and user-facing
  route messages are host-owned.
- Memory thread identifiers should be accepted as host-provided input to any
  LangChain adapter.

## Direct Supabase And Table Dependencies

These should become repository calls or host-provided callbacks in later
phases:

| Current dependency | Current use | Replacement direction |
| --- | --- | --- |
| `supabase().from("services").select(...).ilike("name", ...).single()` | Find a service by model-provided name. | Add a chat repository method or tool factory callback such as `findServiceByName(name)` / `listServices()`. Current `ReservationRepository` only has `getService(serviceId)`, so Backend Platform Phase 6 AI chat contract work and the current Phase 5 AI chat workflow split results own this repository contract gap. |
| `supabase().from("services").select(...)` | `get_services` tool. | Add `listServices()` or require a host callback returning `ReservationService[]`. |
| `supabaseAdmin().from("bookings").select("start_time, seats_booked, seat_labels").eq(...confirmed)` | Availability check. | Use `repository.getConfirmedReservations({ serviceId, bookingDate })`. |
| `supabaseAdmin().from("service_seat_maintenance").select("seat_label").eq(...is_active)` | Availability and create booking validation. | Use `repository.getMaintenanceResourceLabels(serviceId)`. |
| `generateTimeSlots(service.total_seats, bookings, maintenanceSeatLabels)` | Availability response. | Use `generateAvailabilityTimeSlots(service, reservations, { maintenanceResourceLabels })`. |
| `getAvailableSeatsWithMaintenance(...)` | Final chat booking capacity check. | Host confirmation should use reservation core validation and preferably `AtomicReservationRepository.createReservationAtomically`. |
| `supabaseAdmin().from("bookings").insert(...).select().single()` | Final booking creation. | Host-owned confirmation flow using repository methods; not called by chat core. |
| `SupabaseVectorStore(... tableName: "knowledge_chunks", queryName: "match_knowledge")` | Business knowledge retrieval. | Host-provided retriever `(query, count) => Promise<string[]>` or context string. |

The existing `ReservationRepository` does not currently support listing
services or resolving a service by name. Current Phase 6 AI chat backend
contract work should either extend the repository contract with reviewed methods
or define chat-tool factory inputs that accept `listServices` and
`findServiceByName` callbacks separately from the core reservation repository.

## Model, Memory, And Retrieval Inputs

These must become injected host inputs for any reusable LangChain adapter:

- Chat model instance or model runner.
- Tool list or tool factory output.
- Checkpointer/memory implementation.
- Thread id.
- System prompt or prompt sections.
- Date/clock provider.
- Knowledge context string or retriever callback.
- Error mapper for rate limit, quota, provider, and fallback responses.

The reusable core package should not read:

- `OPENROUTER_API_KEY`
- `OPENROUTER_CHAT_MODEL`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- OpenRouter base URL or headers
- Supabase URL or keys

## Prompt Boundary

Reusable prompt sections:

- Use services tool for current bookable services and reservation metadata.
- Services may be capacity-based or assigned-resource-based.
- Ask for one missing booking detail at a time.
- Required booking details are service, date, time, quantity, name, email, and
  phone.
- Check availability before offering or confirming a time slot.
- Only offer times returned by the availability tool.
- Do not call `prepare_booking` until all details come from the user.
- Never create a final booking in chat; ask for confirmation with the card.

Host-owned prompt inputs:

- Assistant persona and brand name.
- Business scope and support categories.
- Operating hours.
- Local date and time zone.
- Business knowledge context headings.
- Fallback and error copy.
- Venue-specific policy text.

## Historical Safe Extraction Candidates

Safe candidates for a framework-neutral `reservation-chat-core` package:

- `ChatMessage` type.
- `BookingData` type.
- `BookingAction` / `booking_confirmation` / `booking_success` types.
- Generic action extension type for host-defined actions.
- Prepared booking payload type using `service_name`, `date`, `start_time`,
  `seats`, `user_name`, `user_email`, and `user_phone`.
- Pure conversion from prepared booking payload to booking action.
- Pure parser for OpenAI-style tool call arguments if the type stays
  dependency-free.
- Configurable domain guard helper that accepts allowed patterns, blocked
  patterns, and fallback response.
- Prompt section builders that accept host-supplied brand copy, date, operating
  hours, and context.

Do not extract into the backend chat core:

- LangChain `BaseMessage`, `AIMessage`, `HumanMessage`, or `ToolMessage`
  traversal unless the current backend chat contract creates a separate adapter
  entry point with a LangChain dependency.
- `createReactAgent`, `MemorySaver`, or `runChatAgent`.
- `createOpenRouterChat`, `createGeminiChat`, or environment-based model
  helpers.
- Supabase service, booking, maintenance, or vector-store reads.
- `createBooking`.
- `getLocationDirectionsAction` and Project Play location data.
- `app/api/chat/route.ts` HTTP behavior.
- `components/chat/**`.

## Clear Package And Non-Package Decision List

Package-owned:

- Serializable booking chat message and action contracts.
- `booking_confirmation` and `booking_success` action names and payload shape.
- Prepared booking payload validation/parsing.
- Configurable domain guard behavior.
- Generic booking prompt sections.
- Tool contract names and schemas, once expressed without host imports.

Adapter-owned:

- LangChain/LangGraph message traversal and tool binding.
- OpenAI-style tool-call resolution, if kept separate from core.
- Conversion from package tool contracts to LangChain `tool(...)` instances.
- Optional Supabase reservation adapter calls through existing reservation
  repository packages.

Host-owned:

- Project Play copy, location, operating hours, and time zone.
- Chat UI and action card rendering.
- Next.js route parsing and response messages.
- Final booking confirmation and write path.
- Auth, customer identity, payment, notifications, and analytics.
- Model provider configuration, API keys, and environment variables.
- Knowledge retriever and vector-store configuration.
- Supabase client construction and production schema deployment.

## Downstream Assumption Check

This historical audit is superseded for downstream planning by the current
backend-platform extraction Phase 6 AI chat documents and the
frontend-backend-sdk-separation Phase 5/6 results. Those documents now own the
active assumptions:

- `booking_confirmation` and `booking_success` as reusable action contracts.
- `get_services`, `check_availability`, and `prepare_booking` as reusable tool
  names.
- Project Play location, UI copy, model provider setup, and knowledge retrieval
  to remain backend/host-owned rather than frontend-owned.
- External frontends to consume chat through the backend `/v1` API or optional
  SDK namespace instead of direct package consumption.
- Reservation tools to move from direct Supabase calls to backend service or
  repository-backed tool factories.

The service listing and service-name lookup gap should be resolved in the
current Phase 6 AI chat backend contract and SDK readiness work, or in the
frontend-backend SDK separation Phase 5/6 follow-up if it affects frontend
integration contracts.
