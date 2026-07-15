import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { ReservationResponse, ResourceResponse } from "@reservation-platform/sdk";
import { filterReservations, futureReservationWarnings } from "./reservation-operations";

const reservations: ReservationResponse[] = [
  { reservation_id: "r1", service_id: "s1", status: "confirmed", date: "2026-08-10", quantity: 1, customer: { name: "Ada" }, reservation_items: [{ resource_id: "resource_1", quantity: 1 }], metadata: { channel_origin: "web_chat", service_name: "Room" } },
  { reservation_id: "r2", service_id: "s2", status: "cancelled", date: "2026-08-11", quantity: 1, customer: { name: "Ben" }, metadata: { channel_origin: "web_booking" } },
];

test("reservation filters combine search, status, channel, and service", () => {
  assert.deepEqual(filterReservations(reservations, { search: "ada", status: "confirmed", channel: "web_chat", serviceId: "s1" }).map((item) => item.reservation_id), ["r1"]);
  assert.deepEqual(filterReservations(reservations, { status: "cancelled" }).map((item) => item.reservation_id), ["r2"]);
});

test("maintenance warnings include confirmed future reservations for the selected resource", () => {
  const resource: ResourceResponse = { resource_id: "resource_1", service_id: "s1", label: "Room A", kind: "room", is_active: true };
  assert.deepEqual(futureReservationWarnings(resource, reservations, "2026-08-05").map((item) => item.reservation_id), ["r1"]);
  assert.equal(futureReservationWarnings(resource, reservations, "2026-08-11").length, 0);
});

test("resource maintenance uses staff-compatible venue-scoped catalog operations", async () => {
  const source = await readFile(new URL("../app/resources/page.tsx", import.meta.url), "utf8");

  assert.match(source, /client\.listServices\(\)/u);
  assert.match(source, /client\.listResources\(\)/u);
  assert.doesNotMatch(source, /listExperienceServices|listExperienceResources/u);
});
