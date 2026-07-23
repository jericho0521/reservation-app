import assert from "node:assert/strict";
import test from "node:test";
import { PlatformError, type ReservationPlatformClient } from "@reservation-platform/sdk";
import {
  loadManagedReservation,
  loadManagedRescheduleAvailability,
  supportsManagedReschedule,
  submitManagedReschedule,
} from "./reservation-management.js";

test("management loader returns only the single token-authorized reservation", async () => {
  const result = await loadManagedReservation({
    getManagedReservation: async () => ({ reservation_id: "reservation_1", service_id: "service_1", status: "confirmed", quantity: 1 }),
  } as Pick<ReservationPlatformClient, "getManagedReservation">, "luma-studio", "token");
  assert.equal(result.found && result.reservation.reservation_id, "reservation_1");
});

test("invalid management links become not found without exposing token state", async () => {
  const result = await loadManagedReservation({
    getManagedReservation: async () => { throw new PlatformError({ code: "not_found", message: "invalid or expired", status: 404 }); },
  } as Pick<ReservationPlatformClient, "getManagedReservation">, "wrong-tenant", "token");
  assert.deepEqual(result, { found: false });
});

test("managed reschedule availability is scoped to the existing service and practitioner", async () => {
  let query: unknown;
  let receivedToken: string | undefined;
  const availability = await loadManagedRescheduleAvailability({
    listManagedReservationAvailability: async (_slug, token, input) => {
      receivedToken = token;
      query = input;
      return { slots: [
        { start_time: "10:00", end_time: "10:30", available_quantity: 1, is_available: true },
        { start_time: "10:30", end_time: "11:00", available_quantity: 0, is_available: false },
      ] };
    },
  }, "luma-studio", "management-token", {
    service_id: "service_1",
    staff_id: "33333333-3333-4333-8333-333333333333",
    quantity: 1,
  }, "2026-08-02");

  assert.deepEqual(query, {
    service_id: "service_1",
    date: "2026-08-02",
    quantity: 1,
    staff_id: "33333333-3333-4333-8333-333333333333",
  });
  assert.equal(receivedToken, "management-token");
  assert.deepEqual(availability.slots.map((slot) => slot.start_time), ["10:00"]);
});

test("managed capacity reschedule availability preserves quantity without requiring a practitioner", async () => {
  let query: unknown;
  const availability = await loadManagedRescheduleAvailability({
    listManagedReservationAvailability: async (_slug, _token, input) => {
      query = input;
      return {
        resource_strategy: "quantity",
        resources: [{ resource_id: "pool-1", label: "Shared capacity", kind: "capacity_bucket", is_active: true }],
        slots: [
          { start_time: "10:00", end_time: "11:00", available_quantity: 3, is_available: true },
          { start_time: "11:00", end_time: "12:00", available_quantity: 1, is_available: true },
        ],
      };
    },
  }, "seat-business", "management-token", {
    service_id: "service_1",
    quantity: 2,
  }, "2026-08-02");

  assert.deepEqual(query, {
    service_id: "service_1",
    date: "2026-08-02",
    quantity: 2,
  });
  assert.equal(availability.resourceStrategy, "quantity");
  assert.equal(availability.resources?.[0]?.kind, "capacity_bucket");
  assert.deepEqual(availability.slots.map((slot) => slot.start_time), ["10:00"]);
});

test("managed rescheduling supports practitioners and pooled capacity but rejects assigned resources", () => {
  assert.equal(supportsManagedReschedule({ staffId: "staff-1", resourceStrategy: "assigned_resource" }), true);
  assert.equal(supportsManagedReschedule({ resourceStrategy: "quantity" }), true);
  assert.equal(supportsManagedReschedule({
    resourceStrategy: "quantity",
    reservationItems: [{ quantity: 2 }],
  }), true);
  assert.equal(supportsManagedReschedule({
    resourceStrategy: "quantity",
    reservationItems: [{ resource_id: "pool-1", quantity: 2 }],
    resources: [{ resource_id: "pool-1", label: "Shared capacity", kind: "capacity_bucket", is_active: true }],
  }), true);
  assert.equal(supportsManagedReschedule({
    resourceStrategy: "quantity",
    reservationItems: [{ resource_label: "A1", quantity: 1 }],
  }), false);
  assert.equal(supportsManagedReschedule({
    resourceStrategy: "quantity",
    reservationItems: [{ resource_id: "room-1", quantity: 1 }],
    resources: [{ resource_id: "room-1", label: "Room 1", kind: "room", is_active: true }],
  }), false);
  assert.equal(supportsManagedReschedule({
    resourceStrategy: "quantity",
    reservationItems: [{ resource_id: "unknown-resource", quantity: 1 }],
  }), false);
  assert.equal(supportsManagedReschedule({ resourceStrategy: "assigned_resource" }), false);
  assert.equal(supportsManagedReschedule({ resourceStrategy: "hybrid" }), false);
});

test("managed reschedule reports a stale slot without exposing backend details", async () => {
  const result = await submitManagedReschedule({
    rescheduleManagedReservation: async () => {
      throw new PlatformError({ code: "conflict", message: "database overlap", status: 409 });
    },
  }, "luma-studio", "opaque-token", {
    date: "2026-08-02",
    start_time: "10:00",
    staff_id: "33333333-3333-4333-8333-333333333333",
  });
  assert.deepEqual(result, { updated: false, conflict: true });
});

test("managed capacity reschedule submits without a practitioner", async () => {
  let input: unknown;
  const result = await submitManagedReschedule({
    rescheduleManagedReservation: async (_slug, _token, value) => {
      input = value;
      return { reservation_id: "reservation_1", service_id: "service_1", status: "confirmed", quantity: 2 };
    },
  }, "seat-business", "opaque-token", {
    date: "2026-08-02",
    start_time: "10:00",
  });

  assert.equal(result.updated, true);
  assert.deepEqual(input, { date: "2026-08-02", start_time: "10:00" });
});
