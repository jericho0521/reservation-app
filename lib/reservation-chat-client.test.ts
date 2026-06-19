import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmChatBooking,
  getReservationChatContext,
  getReservationChatMode,
  sendChatMessage,
} from "./reservation-chat-client";

const originalFetch = globalThis.fetch;
const originalTenantId = process.env.NEXT_PUBLIC_RESERVATION_TENANT_ID;
const originalVenueId = process.env.NEXT_PUBLIC_RESERVATION_VENUE_ID;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreChatContextEnv();
});

test("getReservationChatMode defaults local and opts into platform", () => {
  assert.equal(getReservationChatMode({ NEXT_PUBLIC_RESERVATION_CHAT_MODE: undefined }), "local");
  assert.equal(getReservationChatMode({ NEXT_PUBLIC_RESERVATION_CHAT_MODE: "platform" }), "platform");
});

test("getReservationChatContext reads browser-safe tenant and venue env", () => {
  assert.deepEqual(getReservationChatContext({
    NEXT_PUBLIC_RESERVATION_TENANT_ID: "tenant_123",
    NEXT_PUBLIC_RESERVATION_VENUE_ID: "venue_456",
  }), {
    tenantId: "tenant_123",
    venueId: "venue_456",
  });
});

test("sendChatMessage preserves the local /api/chat request shape", async () => {
  const calls: Array<{ url: string; method?: string; headers: Headers; body: unknown }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined,
    });
    return jsonResponse({
      content: "Sure, I can help.",
      threadId: "thread_123",
      action: null,
    });
  };

  const response = await sendChatMessage({
    messages: [{ role: "user", content: "Book a simulator" }],
    threadId: "thread_existing",
  }, "local");

  assert.deepEqual(response, {
    content: "Sure, I can help.",
    threadId: "thread_123",
    action: null,
  });
  assert.equal(calls[0]?.url, "/api/chat");
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.headers.get("Content-Type"), "application/json");
  assert.deepEqual(calls[0]?.body, {
    messages: [{ role: "user", content: "Book a simulator" }],
    threadId: "thread_existing",
  });
});

test("confirmChatBooking preserves the local /api/chat confirmation shape", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const confirmBooking = {
    service: "Racing Simulator",
    date: "2026-01-02",
    time: "12:00",
    seats: 2,
    name: "Ada",
    email: "ada@example.com",
    phone: "555",
  };

  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined,
    });
    return jsonResponse({ content: "Confirmed" });
  };

  await confirmChatBooking({ confirmBooking, threadId: "thread_123" }, "local");

  assert.equal(calls[0]?.url, "/api/chat");
  assert.deepEqual(calls[0]?.body, {
    messages: [],
    confirmBooking,
    threadId: "thread_123",
  });
});

test("sendChatMessage maps platform chat_module_disabled and keeps context headers", async () => {
  setChatContextEnv();
  const calls: Array<{ url: string; method?: string; headers: Headers; body: unknown }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined,
    });

    return jsonResponse({
      error: {
        code: "chat_module_disabled",
        message: "Chat module is disabled.",
        status: 404,
      },
    }, 404);
  };

  const response = await sendChatMessage({
    messages: [{ role: "user", content: "Can I book tomorrow?" }],
  }, "platform");

  assert.match(response.content, /not enabled yet/);
  assert.match(response.threadId ?? "", /^chat-disabled-/);
  assert.equal(calls[0]?.url, "/api/v1/chat/reservation-sessions");
  assertPlatformChatHeaders(calls[0]?.headers);
  assert.match(calls[0]?.headers.get("Idempotency-Key") ?? "", /^chat-session-/);
  assert.deepEqual(calls[0]?.body, {
    metadata: { source: "current-frontend" },
    venue_id: "venue_456",
  });
  assert.equal(calls.length, 1);
});

test("sendChatMessage posts platform messages with session context and idempotency", async () => {
  setChatContextEnv();
  const calls: Array<{ url: string; method?: string; headers: Headers; body: unknown }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined,
    });

    if (String(url) === "/api/v1/chat/reservation-sessions") {
      return jsonResponse({
        chat_session_id: "chat_123",
        status: "active",
      });
    }

    return jsonResponse({
      data: {
        content: "I can help with that.",
        actions: [],
      },
    });
  };

  const response = await sendChatMessage({
    messages: [
      { role: "assistant", content: "Hello" },
      { role: "user", content: "Two seats please" },
    ],
  }, "platform");

  assert.deepEqual(response, {
    content: "I can help with that.",
    threadId: "chat_123",
    action: null,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "/api/v1/chat/reservation-sessions");
  assert.equal(calls[1]?.url, "/api/v1/chat/reservation-sessions/chat_123/messages");
  assert.equal(calls[1]?.method, "POST");
  assertPlatformChatHeaders(calls[1]?.headers);
  assert.match(calls[1]?.headers.get("Idempotency-Key") ?? "", /^chat-message-/);
  assert.deepEqual(calls[1]?.body, {
    message: "Two seats please",
  });
});

test("sendChatMessage fails closed when platform session create omits chat_session_id", async () => {
  const calls: Array<{ url: string }> = [];
  globalThis.fetch = async (url) => {
    calls.push({ url: String(url) });
    return jsonResponse({
      status: "active",
    });
  };

  await assert.rejects(
    sendChatMessage({
      messages: [{ role: "user", content: "Two seats please" }],
    }, "platform"),
    /missing chat_session_id/,
  );

  assert.deepEqual(calls.map((call) => call.url), ["/api/v1/chat/reservation-sessions"]);
});

test("sendChatMessage translates known-safe platform actions only", async () => {
  const calls: Array<{ url: string }> = [];
  globalThis.fetch = async (url) => {
    calls.push({ url: String(url) });

    if (String(url) === "/api/v1/chat/reservation-sessions") {
      return jsonResponse({
        chat_session_id: "chat_123",
        status: "active",
      });
    }

    return jsonResponse({
      data: {
        content: "Please review this booking.",
        actions: [
          {
            type: "booking_confirmation",
            data: {
              service: "Racing Simulator",
              date: "2026-01-02",
              time: "12:00",
              seats: 2,
              name: "Ada",
              email: "ada@example.com",
            },
          },
          {
            type: "prepare_reservation",
            data: {
              service_name: "Racing Simulator",
              start_at: "2026-01-02T12:00:00.000Z",
              quantity: 2,
              customer: {
                name: "Ada",
                email: "ada@example.com",
                phone: "555",
              },
              reservation_intent_id: "intent_123",
            },
          },
        ],
      },
    });
  };

  const response = await sendChatMessage({
    messages: [{ role: "user", content: "Prepare that booking" }],
  }, "platform");

  assert.equal(calls.length, 2);
  assert.deepEqual(response.action, {
    type: "booking_confirmation",
    data: {
      service: "Racing Simulator",
      date: "2026-01-02",
      time: "12:00",
      seats: 2,
      name: "Ada",
      email: "ada@example.com",
      phone: "555",
      reservation_intent_id: "intent_123",
    },
  });
});

test("sendChatMessage does not render platform confirmation cards without reservation intents", async () => {
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/v1/chat/reservation-sessions") {
      return jsonResponse({
        chat_session_id: "chat_123",
        status: "active",
      });
    }

    return jsonResponse({
      data: {
        content: "I can keep helping.",
        actions: [
          {
            type: "prepare_reservation",
            data: {
              service_name: "Racing Simulator",
              start_at: "2026-01-02T12:00:00.000Z",
              quantity: 2,
              customer: {
                name: "Ada",
                email: "ada@example.com",
                phone: "555",
              },
            },
          },
          {
            type: "booking_confirmation",
            data: {
              service: "Racing Simulator",
              date: "2026-01-02",
              time: "12:00",
              seats: 2,
              name: "Ada",
              email: "ada@example.com",
              phone: "555",
            },
          },
        ],
      },
    });
  };

  const response = await sendChatMessage({
    messages: [{ role: "user", content: "Prepare that booking" }],
  }, "platform");

  assert.deepEqual(response, {
    content: "I can keep helping.",
    threadId: "chat_123",
    action: null,
  });
});

test("sendChatMessage does not trust platform message booking_success actions", async () => {
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/v1/chat/reservation-sessions") {
      return jsonResponse({
        chat_session_id: "chat_123",
        status: "active",
      });
    }

    return jsonResponse({
      data: {
        content: "I can keep helping.",
        actions: [
          {
            type: "booking_success",
            data: {
              service: "Racing Simulator",
              date: "2026-01-02",
              time: "12:00",
              seats: 2,
              name: "Ada",
              email: "ada@example.com",
              phone: "555",
              reservation_intent_id: "intent_123",
            },
          },
        ],
      },
    });
  };

  const response = await sendChatMessage({
    messages: [{ role: "user", content: "Did that book?" }],
  }, "platform");

  assert.deepEqual(response, {
    content: "I can keep helping.",
    threadId: "chat_123",
    action: null,
  });
});

test("sendChatMessage translates location directions only with safe map URLs", async () => {
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/v1/chat/reservation-sessions") {
      return jsonResponse({
        chat_session_id: "chat_123",
        status: "active",
      });
    }

    return jsonResponse({
      data: {
        content: "Here are directions.",
        actions: [
          {
            type: "location_directions",
            data: {
              name: "Project Play",
              address: "123 Main Street",
              area: "Downtown",
              coordinates: { lat: 3.139, lng: 101.6869 },
              mapEmbedUrl: "https://www.google.com/maps/embed?pb=safe",
              wazeUrl: "https://www.waze.com/ul?ll=3.139,101.6869",
              googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Project%20Play",
            },
          },
        ],
      },
    });
  };

  const response = await sendChatMessage({
    messages: [{ role: "user", content: "Directions please" }],
  }, "platform");

  assert.deepEqual(response.action, {
    type: "location_directions",
    data: {
      name: "Project Play",
      address: "123 Main Street",
      area: "Downtown",
      coordinates: { lat: 3.139, lng: 101.6869 },
      mapEmbedUrl: "https://www.google.com/maps/embed?pb=safe",
      wazeUrl: "https://www.waze.com/ul?ll=3.139,101.6869",
      googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Project%20Play",
    },
  });
});

test("sendChatMessage ignores platform location directions with unsafe map URLs", async () => {
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/v1/chat/reservation-sessions") {
      return jsonResponse({
        chat_session_id: "chat_123",
        status: "active",
      });
    }

    return jsonResponse({
      data: {
        content: "Here are directions.",
        actions: [
          {
            type: "location_directions",
            data: {
              name: "Project Play",
              address: "123 Main Street",
              area: "Downtown",
              coordinates: { lat: 3.139, lng: 101.6869 },
              mapEmbedUrl: "javascript:alert(1)",
              wazeUrl: "https://evil.example/ul",
              googleMapsUrl: "https://google.example/maps",
            },
          },
        ],
      },
    });
  };

  const response = await sendChatMessage({
    messages: [{ role: "user", content: "Directions please" }],
  }, "platform");

  assert.deepEqual(response, {
    content: "Here are directions.",
    threadId: "chat_123",
    action: null,
  });
});

test("sendChatMessage ignores non-array platform action lists", async () => {
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/v1/chat/reservation-sessions") {
      return jsonResponse({
        chat_session_id: "chat_123",
        status: "active",
      });
    }

    return jsonResponse({
      data: {
        chat_session_id: "chat_123",
        content: "I can keep helping.",
        actions: {
          type: "prepare_reservation",
          data: {
            service_name: "Racing Simulator",
            start_at: "2026-01-02T12:00:00.000Z",
            quantity: 2,
            customer: {
              name: "Ada",
              email: "ada@example.com",
              phone: "555",
            },
            reservation_intent_id: "intent_123",
          },
        },
      },
    });
  };

  const response = await sendChatMessage({
    messages: [{ role: "user", content: "Prepare that booking" }],
  }, "platform");

  assert.deepEqual(response, {
    content: "I can keep helping.",
    threadId: "chat_123",
    action: null,
  });
});

test("sendChatMessage maps top-level platform actions arrays", async () => {
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/v1/chat/reservation-sessions") {
      return jsonResponse({
        chat_session_id: "chat_123",
        status: "active",
      });
    }

    return jsonResponse({
      chat_session_id: "chat_123",
      content: "Please review this booking.",
      actions: [
        {
          type: "prepare_reservation",
          data: {
            service_name: "Racing Simulator",
            start_at: "2026-01-02T12:00:00.000Z",
            quantity: 2,
            customer: {
              name: "Ada",
              email: "ada@example.com",
              phone: "555",
            },
            reservation_intent_id: "intent_123",
          },
        },
      ],
    });
  };

  const response = await sendChatMessage({
    messages: [{ role: "user", content: "Prepare that booking" }],
  }, "platform");

  assert.deepEqual(response.action, {
    type: "booking_confirmation",
    data: {
      service: "Racing Simulator",
      date: "2026-01-02",
      time: "12:00",
      seats: 2,
      name: "Ada",
      email: "ada@example.com",
      phone: "555",
      reservation_intent_id: "intent_123",
    },
  });
});

test("sendChatMessage ignores non-array top-level platform actions", async () => {
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/v1/chat/reservation-sessions") {
      return jsonResponse({
        chat_session_id: "chat_123",
        status: "active",
      });
    }

    return jsonResponse({
      chat_session_id: "chat_123",
      content: "I can keep helping.",
      actions: {
        type: "prepare_reservation",
        data: {
          service_name: "Racing Simulator",
          start_at: "2026-01-02T12:00:00.000Z",
          quantity: 2,
          customer: {
            name: "Ada",
            email: "ada@example.com",
            phone: "555",
          },
          reservation_intent_id: "intent_123",
        },
      },
    });
  };

  const response = await sendChatMessage({
    messages: [{ role: "user", content: "Prepare that booking" }],
  }, "platform");

  assert.deepEqual(response, {
    content: "I can keep helping.",
    threadId: "chat_123",
    action: null,
  });
});

test("sendChatMessage maps platform reservation_confirmation actions to booking confirmations", async () => {
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/v1/chat/reservation-sessions") {
      return jsonResponse({
        chat_session_id: "chat_123",
        status: "active",
      });
    }

    return jsonResponse({
      data: {
        content: "Please review this booking.",
        actions: [
          {
            type: "reservation_confirmation",
            data: {
              service_name: "Racing Simulator",
              start_at: "2026-01-02T12:00:00.000Z",
              quantity: 2,
              customer: {
                name: "Ada",
                email: "ada@example.com",
                phone: "555",
              },
              reservation_intent_id: "intent_123",
            },
          },
        ],
      },
    });
  };

  const response = await sendChatMessage({
    messages: [{ role: "user", content: "Prepare that booking" }],
  }, "platform");

  assert.deepEqual(response.action, {
    type: "booking_confirmation",
    data: {
      service: "Racing Simulator",
      date: "2026-01-02",
      time: "12:00",
      seats: 2,
      name: "Ada",
      email: "ada@example.com",
      phone: "555",
      reservation_intent_id: "intent_123",
    },
  });
});

test("sendChatMessage maps top-level platform prepare_reservation actions", async () => {
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/v1/chat/reservation-sessions") {
      return jsonResponse({
        chat_session_id: "chat_123",
        status: "active",
      });
    }

    return jsonResponse({
      data: {
        content: "Please review this booking.",
        actions: [
          {
            type: "prepare_reservation",
            service_name: "Racing Simulator",
            start_at: "2026-01-02T12:00:00.000Z",
            quantity: 2,
            customer: {
              name: "Ada",
              email: "ada@example.com",
              phone: "555",
            },
            reservation_intent_id: "intent_123",
          },
        ],
      },
    });
  };

  const response = await sendChatMessage({
    messages: [{ role: "user", content: "Prepare that booking" }],
  }, "platform");

  assert.deepEqual(response.action, {
    type: "booking_confirmation",
    data: {
      service: "Racing Simulator",
      date: "2026-01-02",
      time: "12:00",
      seats: 2,
      name: "Ada",
      email: "ada@example.com",
      phone: "555",
      reservation_intent_id: "intent_123",
    },
  });
});

test("sendChatMessage does not render thin public prepare_reservation actions as confirmable cards", async () => {
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/v1/chat/reservation-sessions") {
      return jsonResponse({
        chat_session_id: "chat_enabled_session",
        status: "active",
      });
    }

    return jsonResponse({
      chat_session_id: "chat_enabled_session",
      content: "I prepared two seats for the evening show.",
      actions: [
        {
          type: "prepare_reservation",
          reservation_intent_id: "intent_enabled_chat",
          service_id: "chat-enabled-screening",
          quantity: 2,
        },
      ],
    });
  };

  const response = await sendChatMessage({
    messages: [{ role: "user", content: "Prepare that booking" }],
  }, "platform");

  assert.equal(response.action, null);
  assert.equal(response.content, "I prepared two seats for the evening show.");
});

test("sendChatMessage leaves unknown or unsafe platform actions as assistant content", async () => {
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/v1/chat/reservation-sessions") {
      return jsonResponse({
        chat_session_id: "chat_123",
        status: "active",
      });
    }

    return jsonResponse({
      data: {
        content: "I can keep helping.",
        actions: [
          {
            type: "open_admin_panel",
            data: { href: "/admin" },
          },
          {
            type: "prepare_reservation",
            service_id: "chat-enabled-screening",
            quantity: 2,
          },
          {
            type: "booking_confirmation",
            data: {
              service: "Racing Simulator",
              seats: 2,
            },
          },
        ],
      },
    });
  };

  const response = await sendChatMessage({
    messages: [{ role: "user", content: "Do something" }],
  }, "platform");

  assert.deepEqual(response, {
    content: "I can keep helping.",
    threadId: "chat_123",
    action: null,
  });
});

test("confirmChatBooking returns non-confirmed platform explanation without an intent", async () => {
  const calls: Array<{ url: string }> = [];
  const confirmBooking = {
    service: "Racing Simulator",
    date: "2026-01-02",
    time: "12:00",
    seats: 2,
    name: "Ada",
    email: "ada@example.com",
    phone: "555",
  };

  globalThis.fetch = async (url) => {
    calls.push({ url: String(url) });
    return jsonResponse({});
  };

  const response = await confirmChatBooking({ confirmBooking, threadId: "chat_123" }, "platform");

  assert.equal(calls.length, 0);
  assert.match(response.content, /prepared reservation/);
  assert.equal(response.threadId, "chat_123");
  assert.equal(response.confirmed, false);
});

test("confirmChatBooking posts platform reservation intent with idempotency", async () => {
  setChatContextEnv();
  const calls: Array<{ url: string; headers: Headers; body: unknown }> = [];
  const confirmBooking = {
    service: "Racing Simulator",
    date: "2026-01-02",
    time: "12:00",
    seats: 2,
    name: "Ada",
    email: "ada@example.com",
    phone: "555",
    reservation_intent_id: "intent_123",
  };

  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined,
    });
    return jsonResponse({
      data: {
        chat_session_id: "chat_123",
        content: "Confirmed",
        reservation: {
          reservation_id: "res_123",
          service_id: "svc_123",
          quantity: 2,
          status: "confirmed",
        },
      },
    });
  };

  const response = await confirmChatBooking({ confirmBooking, threadId: "chat_123" }, "platform");

  assert.equal(calls[0]?.url, "/api/v1/chat/reservation-sessions/chat_123/confirm");
  assertPlatformChatHeaders(calls[0]?.headers);
  assert.match(calls[0]?.headers.get("Idempotency-Key") ?? "", /^chat-confirm-/);
  assert.deepEqual(calls[0]?.body, {
    reservation_intent_id: "intent_123",
  });
  assert.equal(response.confirmed, true);
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setChatContextEnv() {
  process.env.NEXT_PUBLIC_RESERVATION_TENANT_ID = "tenant_123";
  process.env.NEXT_PUBLIC_RESERVATION_VENUE_ID = "venue_456";
}

function restoreChatContextEnv() {
  restoreEnvValue("NEXT_PUBLIC_RESERVATION_TENANT_ID", originalTenantId);
  restoreEnvValue("NEXT_PUBLIC_RESERVATION_VENUE_ID", originalVenueId);
}

function restoreEnvValue(key: "NEXT_PUBLIC_RESERVATION_TENANT_ID" | "NEXT_PUBLIC_RESERVATION_VENUE_ID", value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

function assertPlatformChatHeaders(headers: Headers | undefined) {
  assert.ok(headers);
  assert.equal(headers.get("X-Reservation-Tenant-Id"), "tenant_123");
  assert.equal(headers.get("X-Reservation-Venue-Id"), "venue_456");
  assert.match(headers.get("X-Correlation-Id") ?? "", /^frontend-/);
}
