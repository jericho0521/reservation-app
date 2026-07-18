# @project-play/reservation-chat-core

Legacy framework-neutral booking chat contracts, guard helpers, prompt sections,
tool name constants, prepared booking parsing, and reservation chat tool
factories.

This package remains in the repository as reference and compatibility context
for older `@project-play/*` reservation package work. It is not the active
plug-and-play chat package for new external consumers. Current consumers should
use the `@reservation-platform/sdk` chat namespace for SDK-facing chat flows and
the backend-owned `@reservation-platform/ai-chat` module for provider-neutral
backend chat contracts.

This package is intentionally headless. It does not import React, Next.js,
Supabase, OpenRouter, LangChain, or LangGraph. Hosts provide venue copy,
reservation rules, model configuration, tools, repositories, and UI rendering.

## Create reservation chat tools

```ts
import { createReservationChatTools } from "@project-play/reservation-chat-core";
import type { ReservationRepository } from "@project-play/reservations-core";

declare const repository: ReservationRepository;

const tools = createReservationChatTools({
  repository,
  listServices: async () => [
    /* host-loaded ReservationService[] */
  ],
  resolveServiceByName: async (serviceName) => {
    /* host-owned name lookup */
    return null;
  },
  clock: { now: () => new Date() },
  knowledgeTool: {
    retrieve: async ({ query }) => ({ answer: `Host knowledge for ${query}` }),
  },
  availability: {
    legacyFallbackLabels: (service) =>
      service.resources?.map((resource) => resource.label).reverse() ?? [],
  },
  customTools: [
    {
      name: "get_location_directions",
      description: "Return host-owned venue directions.",
      inputSchema: { type: "object", properties: {}, required: [] },
      execute: () => ({ address: "Host venue address" }),
    },
  ],
});
```

The factory returns plain descriptors with `name`, `description`,
`inputSchema`, and `execute(input)`. It does not return LangChain Tool
instances; adapters should wrap these descriptors in the host or in a separate
adapter package. Tool names must be unique across built-ins, the optional
knowledge tool, and custom tools; duplicate names throw during factory
construction.

Built-in tools:

- `get_services`: calls host `listServices()` and returns generic reservation
  metadata.
- `check_availability`: resolves a service by host callback, reads confirmed
  reservations and maintenance labels through `ReservationRepository`, and uses
  `generateAvailabilityTimeSlots`. The `date` input must be a real calendar
  date in `YYYY-MM-DD` format. Hosts with legacy assigned-resource bookings
  that stored only quantities can pass `availability.legacyFallbackLabels` as a
  string array or `(service) => string[]` callback.
- `prepare_booking`: validates the Phase 14 input and returns a
  `PreparedBookingPayload` with `ready_for_confirmation: true`; it does not
  create the final booking.
- `search_knowledge`, when configured: requires a non-empty `query` string
  before calling the host retriever.

## Legacy verification

For legacy internal tarball verification, generate artifacts from the repository
root:

```powershell
pnpm run packages:pack
```

This is safe to run in the current workspace. It builds package declarations
and writes generated tarballs under ignored `dist-packages/`; it does not
publish packages or touch production data.

Legacy compatibility fixtures may install this package with the matching
reservation core tarball:

```powershell
pnpm add C:\path\to\reservation-app\dist-packages\project-play-reservation-chat-core-0.0.0.tgz C:\path\to\reservation-app\dist-packages\project-play-reservations-core-0.0.0.tgz
```

The package declares `@project-play/reservations-core` as a peer dependency, so
legacy compatibility checks install the matching core tarball alongside the chat
tarball. New external consumer proofs should use the `examples/sdk-*` fixtures
and import chat APIs through `@reservation-platform/sdk` instead of installing
this package directly. The headless chat package does not require Next.js,
React, Supabase, OpenRouter, LangChain, or LangGraph.

## Parse a prepared booking action

```ts
import { extractPreparedBookingActionFromToolCalls } from "@project-play/reservation-chat-core";

const action = extractPreparedBookingActionFromToolCalls([
  {
    function: {
      name: "prepare_booking",
      arguments: JSON.stringify({
        service_name: "Racing Simulator",
        date: "2026-04-29",
        start_time: "14:00",
        seats: 2,
        user_name: "Mo",
        user_email: "mo@example.com",
        user_phone: "+60 12-345 6789",
      }),
    },
  },
]);
```

## Configure a domain guard

```ts
import { createDomainGuard } from "@project-play/reservation-chat-core";

const guard = createDomainGuard({
  allowedTopics: [/booking/i, /availability/i, "venue"],
  blockedTopics: [/system prompt/i, /\bwhat\s+model\b/i],
  fallbackResponse: "I can help with bookings, availability, and venue questions.",
});

const response = guard("what model are you?");
```

## Build prompt sections

```ts
import { buildBookingPromptSections } from "@project-play/reservation-chat-core";

const promptSections = buildBookingPromptSections({
  copy: {
    assistantName: "Booking Assistant",
    venueName: "Demo Venue",
    supportCopy: "Use only host-approved knowledge and reservation rules.",
    confirmationCopy: "Never create the final booking before host confirmation.",
  },
  reservationRules: [
    {
      label: "Confirmation",
      description: "Prepare booking_confirmation actions for the host UI.",
    },
  ],
  toolInstructions: ["Call prepare_booking only after all customer fields are present."],
});
```

## Public exports

All public APIs are exported from the package root:

- Booking action and serializable message types.
- Prepared booking payload parsing and action mapping helpers.
- Configurable domain guard helpers.
- Prompt-section builders.
- Framework-neutral tool names, inputs, JSON schema constants, and tool
  factories.
