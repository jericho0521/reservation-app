import assert from "node:assert/strict";
import test from "node:test";
import { PlatformError, type ReservationPlatformClient } from "@reservation-platform/sdk";
import { loadManagedReservation } from "./reservation-management.js";

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
