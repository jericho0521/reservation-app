import assert from "node:assert/strict";
import test from "node:test";
import { createChatPostHandler, parseConfirmBookingPayload } from "./route";

test("parseConfirmBookingPayload requires a phone number", () => {
  assert.equal(parseConfirmBookingPayload({
    service: "Racing Simulator",
    date: "2026-05-30",
    time: "14:00",
    seats: 2,
    name: "Alex",
    email: "alex@example.com",
  }), null);
});

test("parseConfirmBookingPayload accepts complete confirmation details", () => {
  assert.deepEqual(parseConfirmBookingPayload({
    service: " Racing Simulator ",
    date: "2026-05-30",
    time: "14:00",
    seats: 2,
    name: " Alex ",
    email: "alex@example.com",
    phone: " +60 12-345 6789 ",
  }), {
    service: "Racing Simulator",
    date: "2026-05-30",
    time: "14:00",
    seats: 2,
    name: "Alex",
    email: "alex@example.com",
    phone: "+60 12-345 6789",
  });
});

test("POST rejects invalid confirmation payloads with the existing response shape", async () => {
  const handler = createChatPostHandler({
    createBooking: async () => {
      throw new Error("createBooking should not run for invalid payloads");
    },
  });
  const response = await handler(new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({
      threadId: "chat-thread",
      confirmBooking: {
        service: "Racing Simulator",
        date: "2026-05-30",
        time: "14:00",
        seats: 2,
        name: "Alex",
        email: "alex@example.com",
      },
    }),
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    content: "Sorry, the booking confirmation details are incomplete. Please restart the booking and include your phone number.",
    action: null,
    threadId: "chat-thread",
  });
});

test("POST returns booking_success for successful host-confirmed bookings", async () => {
  const handler = createChatPostHandler({
    createBooking: async (service, date, startTime, seats, name, email, phone) => {
      assert.deepEqual(
        { service, date, startTime, seats, name, email, phone },
        {
          service: "Racing Simulator",
          date: "2026-05-30",
          startTime: "14:00",
          seats: 2,
          name: "Alex",
          email: "alex@example.com",
          phone: "+60 12-345 6789",
        },
      );

      return {
        success: true,
        booking_id: "booking-123",
        message: "Booking confirmed",
      };
    },
  });
  const response = await handler(new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({
      confirmBooking: {
        service: "Racing Simulator",
        date: "2026-05-30",
        time: "14:00",
        seats: 2,
        name: "Alex",
        email: "alex@example.com",
        phone: "+60 12-345 6789",
      },
    }),
  }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(
    body.content,
    /You've booked 2 seat\(s\) for Racing Simulator on 2026-05-30 at 14:00/,
  );
  assert.deepEqual(body.action, {
    type: "booking_success",
    data: {
      service: "Racing Simulator",
      date: "2026-05-30",
      time: "14:00",
      seats: 2,
      name: "Alex",
      email: "alex@example.com",
      phone: "+60 12-345 6789",
    },
  });
});

test("POST normal chat branch preserves response shape and threadId", async () => {
  let contextQuery = "";
  const handler = createChatPostHandler({
    getRelevantContext: async (userMessage) => {
      contextQuery = userMessage;
      return "Relevant Project Play context";
    },
    runChatAgent: async (messages, context, threadId) => {
      assert.deepEqual(messages, [
        { role: "user", content: "Can I book PS5 tomorrow?" },
      ]);
      assert.equal(context, "Relevant Project Play context");
      assert.equal(threadId, "thread-123");

      return {
        content: "Sure, what time would you like?",
        action: null,
      };
    },
  });
  const response = await handler(new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({
      threadId: "thread-123",
      messages: [
        { role: "user", content: "Can I book PS5 tomorrow?" },
      ],
    }),
  }));

  assert.equal(contextQuery, "Can I book PS5 tomorrow?");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    content: "Sure, what time would you like?",
    action: null,
    threadId: "thread-123",
  });
});
