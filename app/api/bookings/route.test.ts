import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBookingSearchFilter,
  createBookingResponse,
  normalizeBookingSearchTerm,
  POST,
} from "./route";

const validBookingPayload = {
  service_id: "00000000-0000-4000-8000-000000000001",
  user_name: "Ada Lovelace",
  user_email: "ada@example.com",
  user_phone: "555-0100",
  booking_date: "2026-01-02",
  start_time: "12:00",
  end_time: "13:00",
  seats_booked: 1,
  seat_labels: ["RS1"],
  interface_type: "form" as const,
};

test("POST /api/bookings returns 400 for invalid booking payloads", async () => {
  const response = await POST(new Request("http://localhost/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }));

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, "Invalid booking data");
  assert.equal(Array.isArray(payload.details), true);
});

test("POST /api/bookings returns 400 for malformed JSON", async () => {
  const response = await POST(new Request("http://localhost/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Invalid JSON body",
  });
});

test("createBookingResponse uses atomic RPC and returns created booking", async () => {
  const rpcCalls: Array<{ fn: string; params?: Record<string, unknown> }> = [];
  const client = {
    from() {
      throw new Error("from() should not be called for atomic booking creation");
    },
    async rpc(fn: string, params?: Record<string, unknown>) {
      rpcCalls.push({ fn, params });

      return {
        data: {
          ok: true,
          atomic: true,
          booking: {
            id: "00000000-0000-4000-8000-000000000002",
            ...validBookingPayload,
            status: "confirmed",
          },
          validation: { ok: true },
        },
        error: null,
      };
    },
  };

  const response = await createBookingResponse(validBookingPayload, client);

  assert.equal(response.status, 201);
  assert.equal(rpcCalls[0]?.fn, "create_reservation_atomic");
  assert.deepEqual(rpcCalls[0]?.params, {
    payload: {
      ...validBookingPayload,
      reservation_items: [
        {
          resource_id: null,
          resource_label: "RS1",
          quantity: 1,
        },
      ],
      status: "confirmed",
    },
  });
  assert.deepEqual(await response.json(), {
    id: "00000000-0000-4000-8000-000000000002",
    ...validBookingPayload,
    status: "confirmed",
  });
});

test("createBookingResponse preserves native multi-quantity items", async () => {
  const rpcCalls: Array<{ fn: string; params?: Record<string, unknown> }> = [];
  const nativePayload = {
    ...validBookingPayload,
    seats_booked: 2,
    seat_labels: undefined,
    items: [
      {
        resource_label: "Room A",
        quantity: 2,
      },
    ],
  };
  const client = {
    from() {
      throw new Error("from() should not be called for atomic booking creation");
    },
    async rpc(fn: string, params?: Record<string, unknown>) {
      rpcCalls.push({ fn, params });

      return {
        data: {
          ok: true,
          atomic: true,
          booking: {
            id: "00000000-0000-4000-8000-000000000003",
            ...validBookingPayload,
            seats_booked: 2,
            seat_labels: ["Room A"],
            status: "confirmed",
          },
          validation: { ok: true },
        },
        error: null,
      };
    },
  };

  const response = await createBookingResponse(nativePayload, client);

  assert.equal(response.status, 201);
  assert.equal(rpcCalls[0]?.fn, "create_reservation_atomic");
  assert.deepEqual(rpcCalls[0]?.params, {
    payload: {
      service_id: validBookingPayload.service_id,
      user_name: validBookingPayload.user_name,
      user_email: validBookingPayload.user_email,
      user_phone: validBookingPayload.user_phone,
      booking_date: validBookingPayload.booking_date,
      start_time: validBookingPayload.start_time,
      end_time: validBookingPayload.end_time,
      seats_booked: 2,
      seat_labels: ["Room A"],
      reservation_items: [
        {
          resource_id: null,
          resource_label: "Room A",
          quantity: 2,
        },
      ],
      status: "confirmed",
      interface_type: "form",
    },
  });
});

test("createBookingResponse accepts reservation_items alias", async () => {
  const rpcCalls: Array<{ fn: string; params?: Record<string, unknown> }> = [];
  const nativePayload = {
    ...validBookingPayload,
    seats_booked: 2,
    seat_labels: undefined,
    reservation_items: [
      {
        resource_label: "Room A",
        quantity: 2,
      },
    ],
  };
  const client = {
    from() {
      throw new Error("from() should not be called for atomic booking creation");
    },
    async rpc(fn: string, params?: Record<string, unknown>) {
      rpcCalls.push({ fn, params });

      return {
        data: {
          ok: true,
          atomic: true,
          booking: {
            id: "00000000-0000-4000-8000-000000000004",
            ...validBookingPayload,
            seats_booked: 2,
            seat_labels: ["Room A"],
            status: "confirmed",
          },
          validation: { ok: true },
        },
        error: null,
      };
    },
  };

  const response = await createBookingResponse(nativePayload, client);

  assert.equal(response.status, 201);
  assert.deepEqual(rpcCalls[0]?.params, {
    payload: {
      service_id: validBookingPayload.service_id,
      user_name: validBookingPayload.user_name,
      user_email: validBookingPayload.user_email,
      user_phone: validBookingPayload.user_phone,
      booking_date: validBookingPayload.booking_date,
      start_time: validBookingPayload.start_time,
      end_time: validBookingPayload.end_time,
      seats_booked: 2,
      seat_labels: ["Room A"],
      reservation_items: [
        {
          resource_id: null,
          resource_label: "Room A",
          quantity: 2,
        },
      ],
      status: "confirmed",
      interface_type: "form",
    },
  });
});

test("createBookingResponse maps atomic resource conflicts to existing API error", async () => {
  const client = {
    from() {
      throw new Error("from() should not be called for atomic booking creation");
    },
    async rpc() {
      return {
        data: {
          ok: false,
          error_code: "resource_conflict",
          message: "Some selected resources are already booked",
          conflicting_resource_labels: ["RS1"],
        },
        error: null,
      };
    },
  };

  const response = await createBookingResponse(validBookingPayload, client);

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "Some selected seats are no longer available",
    seat_labels: ["RS1"],
  });
});

test("createBookingResponse maps invalid resource labels to a distinct API error", async () => {
  const client = {
    from() {
      throw new Error("from() should not be called for atomic booking creation");
    },
    async rpc() {
      return {
        data: {
          ok: false,
          error_code: "invalid_resource_labels",
          message: "Selected resource labels are not valid for this service",
          conflicting_resource_labels: ["RS99"],
        },
        error: null,
      };
    },
  };

  const response = await createBookingResponse({
    ...validBookingPayload,
    seat_labels: ["RS99"],
  }, client);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Selected seat labels are not valid for this service",
    seat_labels: ["RS99"],
  });
});

test("normalizeBookingSearchTerm trims blank searches", () => {
  assert.equal(normalizeBookingSearchTerm("   "), null);
  assert.equal(normalizeBookingSearchTerm("  Alex  "), "Alex");
});

test("buildBookingSearchFilter quotes reserved PostgREST characters", () => {
  assert.equal(
    buildBookingSearchFilter('Smith, Alex (VIP) "Racer"'),
    'user_name.ilike."%Smith, Alex (VIP) \\"Racer\\"%",user_email.ilike."%Smith, Alex (VIP) \\"Racer\\"%",user_phone.ilike."%Smith, Alex (VIP) \\"Racer\\"%"',
  );
});

test("buildBookingSearchFilter escapes SQL LIKE wildcards", () => {
  assert.equal(
    buildBookingSearchFilter("100%_ready\\now"),
    'user_name.ilike."%100\\\\%\\\\_ready\\\\\\\\now%",user_email.ilike."%100\\\\%\\\\_ready\\\\\\\\now%",user_phone.ilike."%100\\\\%\\\\_ready\\\\\\\\now%"',
  );
});
