import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRuntime } from "@reservation-platform/ai-chat";
import type { AvailabilityResponse, ReservationResponse, ServiceResponse } from "@reservation-platform/contract-types";
import { createWhatsAppBookingAutomationResponder, type WhatsAppReservationTools } from "./booking-automation.js";
import { missingBookingFields, readWhatsAppServiceBookingConfig } from "./booking-config.js";

const service: ServiceResponse = {
  service_id: "svc_room",
  name: "Meeting Room",
  resource_strategy: "quantity",
  metadata: {
    whatsapp_booking_config: JSON.stringify({
      mode: "capacity",
      required_fields: ["service_id", "date", "start_time", "quantity", "customer_name", "customer_phone"],
    }),
  },
};

const assignedResourceService: ServiceResponse = {
  service_id: "svc_racing",
  name: "Racing Simulator",
  resource_strategy: "assigned",
  metadata: {
    whatsapp_booking_config: JSON.stringify({
      mode: "assigned_resource",
      required_fields: ["service_id", "date", "start_time", "resource_ids", "customer_name", "customer_phone"],
      field_labels: {
        resource_ids: "Simulator Seat",
      },
    }),
  },
};

test("booking automation asks for missing strict service fields", async () => {
  const responder = createWhatsAppBookingAutomationResponder({
    agentRuntime: fakeAgent({ fields: { service_id: "svc_room" }, reply: "What date should I book?" }),
    reservationTools: fakeTools(),
    readiness: { databaseReady: true, providerReady: true },
  });

  const response = await responder(baseInput("I want to book"));

  assert.match(response.content, /What date/u);
  assert.equal(response.metadata?.reason, "missing_fields");
});

test("booking automation uses assigned-resource service config without domain hardcoding", async () => {
  const responder = createWhatsAppBookingAutomationResponder({
    agentRuntime: fakeAgent({
      fields: {
        service_id: "svc_racing",
        date: "2026-07-01",
        start_time: "10:00",
        customer_name: "Alya",
        customer_phone: "+60111111111",
      },
      reply: "Which simulator seat should I reserve?",
    }),
    reservationTools: fakeTools({
      async listServices() {
        return [service, assignedResourceService];
      },
      async getService(serviceId) {
        return serviceId === "svc_racing" ? assignedResourceService : service;
      },
    }),
    readiness: { databaseReady: true, providerReady: true },
  });

  const response = await responder(baseInput("Book racing simulator tomorrow at 10"));

  assert.match(response.content, /Which simulator seat/u);
  assert.equal(response.metadata?.reason, "missing_fields");
  assert.equal(response.metadata?.missing_fields, "resource_ids");
});

test("service booking config supports field_labels metadata", () => {
  const config = readWhatsAppServiceBookingConfig(assignedResourceService);
  const missing = missingBookingFields({
    service_id: "svc_racing",
    date: "2026-07-01",
    start_time: "10:00",
    customer_name: "Alya",
    customer_phone: "+60111111111",
  }, config);

  assert.deepEqual(missing.map((field) => field.label), ["Simulator Seat"]);
});

test("booking automation does not duplicate the latest persisted inbound message", async () => {
  let observedMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  const responder = createWhatsAppBookingAutomationResponder({
    agentRuntime: {
      async run(input) {
        observedMessages = input.messages;
        return {
          message: { role: "assistant", content: "What date should I book?" },
          data: {
            reply: "What date should I book?",
            fields: { service_id: "svc_room" },
          },
        };
      },
    },
    reservationTools: fakeTools(),
    readiness: { databaseReady: true, providerReady: true },
  });

  await responder({
    ...baseInput("I want to book"),
    messages: [{
      message_id: "msg_1",
      conversation_id: "conversation_1",
      direction: "inbound",
      content: "I want to book",
      created_at: "2026-07-01T00:00:00.000Z",
    }],
  });

  assert.deepEqual(observedMessages, [{ role: "user", content: "I want to book" }]);
});

test("booking automation prepares a draft and waits for confirmation", async () => {
  let createCalls = 0;
  const responder = createWhatsAppBookingAutomationResponder({
    agentRuntime: fakeAgent({
      reply: "I can book that.",
      fields: {
        service_id: "svc_room",
        date: "2026-07-01",
        start_time: "10:00",
        quantity: 2,
        customer_name: "Alya",
        customer_phone: "+60111111111",
      },
    }),
    reservationTools: fakeTools({
      async createReservation() {
        createCalls += 1;
        throw new Error("should not create before confirmation");
      },
    }),
    readiness: { databaseReady: true, providerReady: true },
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  });

  const response = await responder(baseInput("Book a room tomorrow at 10 for 2"));

  assert.match(response.content, /Please confirm/u);
  assert.equal(response.metadata?.draft_status, "pending_confirmation");
  assert.equal(createCalls, 0);
});

test("booking automation creates reservation only after confirming latest draft", async () => {
  const responder = createWhatsAppBookingAutomationResponder({
    agentRuntime: fakeAgent({ reply: "unused", fields: {} }),
    reservationTools: fakeTools(),
    readiness: { databaseReady: true, providerReady: true },
  });
  const draft = {
    draft_id: "draft_1",
    service_id: "svc_room",
    fields: {
      service_id: "svc_room",
      date: "2026-07-01",
      start_time: "10:00",
      quantity: 2,
      customer_name: "Alya",
      customer_phone: "+60111111111",
    },
  };

  const response = await responder({
    ...baseInput("confirm"),
    messages: [{
      message_id: "msg_1",
      conversation_id: "conversation_1",
      direction: "outbound",
      content: "Please confirm",
      created_at: "2026-07-01T00:00:00.000Z",
      metadata: {
        draft_status: "pending_confirmation",
        draft_id: "draft_1",
        draft_json: JSON.stringify(draft),
      },
    }],
  });

  assert.match(response.content, /confirmed/u);
  assert.equal(response.metadata?.reservation_id, "reservation_1");
});

test("booking automation ignores drafts that were already confirmed", async () => {
  let createCalls = 0;
  const responder = createWhatsAppBookingAutomationResponder({
    agentRuntime: fakeAgent({ reply: "Which time should I book?", fields: { service_id: "svc_room" } }),
    reservationTools: fakeTools({
      async createReservation() {
        createCalls += 1;
        throw new Error("stale draft should not create a second reservation");
      },
    }),
    readiness: { databaseReady: true, providerReady: true },
  });
  const draft = {
    draft_id: "draft_1",
    service_id: "svc_room",
    fields: {
      service_id: "svc_room",
      date: "2026-07-01",
      start_time: "10:00",
      quantity: 2,
      customer_name: "Alya",
      customer_phone: "+60111111111",
    },
  };

  const response = await responder({
    ...baseInput("confirm"),
    messages: [
      {
        message_id: "msg_1",
        conversation_id: "conversation_1",
        direction: "outbound",
        content: "Please confirm",
        created_at: "2026-07-01T00:00:00.000Z",
        metadata: {
          draft_status: "pending_confirmation",
          draft_id: "draft_1",
          draft_json: JSON.stringify(draft),
        },
      },
      {
        message_id: "msg_2",
        conversation_id: "conversation_1",
        direction: "outbound",
        content: "Your reservation is confirmed",
        created_at: "2026-07-01T00:01:00.000Z",
        metadata: {
          draft_status: "confirmed",
          draft_id: "draft_1",
          reservation_id: "reservation_1",
        },
      },
    ],
  });

  assert.equal(createCalls, 0);
  assert.equal(response.metadata?.reason, "missing_fields");
});

function baseInput(message: string) {
  return {
    message: {
      message,
      source: "whatsapp" as const,
      provider: "session_qr" as const,
      providerMessageId: "wamid_1",
    },
    knowledge: [],
    config: {
      business_name: "Demo Business",
      default_service_id: "svc_room",
      language: "en",
      tone: "friendly",
      fallback_message: "Please wait for staff.",
      booking_confirmation_required: true,
      updated_at: "2026-07-01T00:00:00.000Z",
    },
    conversation_id: "conversation_1",
    messages: [],
  };
}

function fakeAgent(data: { reply: string; fields: Record<string, unknown> }): AgentRuntime {
  return {
    async run() {
      return {
        message: { role: "assistant", content: data.reply },
        data: {
          reply: data.reply,
          fields: data.fields,
        },
      };
    },
  };
}

function fakeTools(overrides: Partial<WhatsAppReservationTools> = {}): WhatsAppReservationTools {
  return {
    async listServices() {
      return [service];
    },
    async getService() {
      return service;
    },
    async checkAvailability(): Promise<AvailabilityResponse> {
      return {
        slots: [{
          start_time: "10:00",
          end_time: "11:00",
          available_quantity: 4,
          is_available: true,
        }],
      };
    },
    async createReservation(): Promise<ReservationResponse> {
      return {
        reservation_id: "reservation_1",
        status: "confirmed",
        service_id: "svc_room",
        date: "2026-07-01",
        start_time: "10:00",
        quantity: 2,
      };
    },
    ...overrides,
  };
}
