import assert from "node:assert/strict";
import test from "node:test";
import { PlatformError, type ReservationPlatformClient } from "@reservation-platform/sdk";
import {
  loadManagedReservation,
  loadManagedRescheduleAvailability,
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
  const slots = await loadManagedRescheduleAvailability({
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
  assert.deepEqual(slots.map((slot) => slot.start_time), ["10:00"]);
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
