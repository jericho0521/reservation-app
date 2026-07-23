import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("owner seat booking selects only live quantity-aware slots", async () => {
  const [route, form, actions] = await Promise.all([
    readFile(new URL("../app/api/availability/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/reservations/staff-appointment-create.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reservations/actions.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /createConsolePlatformClient\(\)\.listAvailability/u);
  assert.match(route, /service_id: serviceId, date, quantity/u);
  assert.match(route, /taken_resource_labels: slot\.taken_resource_labels/u);
  assert.match(route, /maintenance_resource_labels: slot\.maintenance_resource_labels/u);
  assert.match(route, /private, no-store/u);
  assert.match(form, /fetch\(`\/admin\/api\/availability/u);
  assert.match(form, /slot\.available_quantity >= quantity/u);
  assert.match(form, /availabilitySlotSupportsResources\(slot, serviceResources, selectedResourceIds\)/u);
  assert.match(form, /Only slots with enough remaining seats are shown/u);
  assert.doesNotMatch(actions, /client\.createReservation\(/u);
  assert.match(actions, /client\.createStaffAppointment/u);
  assert.match(actions, /createIdempotencyKey\("console-reservation-create"\)/u);
});
