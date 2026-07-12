import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createAssignedResourcePolicy,
  generateAvailabilityTimeSlots,
  validateReservationRequest,
  type Reservation,
  type ReservationService,
} from "../../packages/reservations-core/src/index.ts";

const service: ReservationService = {
  id: "31000000-0000-4000-8000-000000000010",
  name: "Apex Grid Grand Prix Session",
  resource_kind: "station",
  selection_mode: "assigned_resource",
  policy: createAssignedResourcePolicy(6),
  layout: { kind: "grid", columns: 3, rows: 2 },
  total_seats: 6,
  resources: Array.from({ length: 6 }, (_, index) => ({
    id: `sim-${index + 1}`,
    service_id: "31000000-0000-4000-8000-000000000010",
    label: `SIM ${String(index + 1).padStart(2, "0")}`,
    kind: "station" as const,
    is_active: true,
    capacity: 1,
  })),
};

function reservation(label: string, id = "booking-1"): Reservation {
  return {
    id,
    service_id: service.id,
    customer_name: "Demo Driver",
    customer_email: "driver@example.invalid",
    booking_date: "2026-08-01",
    start_time: "14:00",
    end_time: "15:00",
    quantity: 1,
    items: [{ resource_label: label, quantity: 1 }],
    interface_type: "form",
    seats_booked: 1,
    seat_labels: [label],
  };
}

test("racing seed contains published experience, rigs, maintenance, and a sample reservation", async () => {
  const sql = await readFile("packages/database/seeds/racing-demo.sql", "utf8");
  assert.match(sql, /'apex-grid'/u);
  assert.match(sql, /'racing_gaming'/u);
  assert.match(sql, /generate_series\(1, 6\)/u);
  assert.match(sql, /'SIM 04'[\s\S]*'Pedal calibration'/u);
  assert.match(sql, /'SIM 02'[\s\S]*'confirmed'/u);
});

test("booked and maintenance simulators are never offered for the affected slot", () => {
  const slots = generateAvailabilityTimeSlots(service, [reservation("SIM 02")], {
    maintenanceResourceLabels: ["SIM 04"],
    operatingWindows: [{ start_time: "14:00", end_time: "16:00", interval_minutes: 60 }],
    durationMinutes: 60,
  });
  const slot = slots.find((candidate) => candidate.start_time === "14:00");
  assert.ok(slot);
  const unavailable = new Set([...(slot.taken_resource_labels ?? []), ...(slot.maintenance_resource_labels ?? [])]);
  const offered = service.resources.filter((resource) => !unavailable.has(resource.label)).map((resource) => resource.label);
  assert.deepEqual(offered, ["SIM 01", "SIM 03", "SIM 05", "SIM 06"]);
});

test("two simultaneous claims for one simulator produce one booking and one conflict", async () => {
  const existing: Reservation[] = [];
  let serial = Promise.resolve();
  const reserveAtomically = (requested: Reservation) => {
    const result = serial.then(() => {
      const validation = validateReservationRequest(service, existing, requested);
      if (validation.ok) existing.push(requested);
      return validation;
    });
    serial = result.then(() => undefined);
    return result;
  };

  const [first, second] = await Promise.all([
    reserveAtomically(reservation("SIM 01", "request-a")),
    reserveAtomically(reservation("SIM 01", "request-b")),
  ]);
  assert.equal(first.ok, true);
  assert.deepEqual(second, { ok: false, error: "resource_conflict", conflicting_resource_labels: ["SIM 01"] });
  assert.equal(existing.length, 1);
});

test("database atomic RPC locks the service before checking conflicts and inserting", async () => {
  const sql = await readFile("packages/database/migrations/supabase/000008_atomic_reservation_rpc.sql", "utf8");
  const lockIndex = sql.indexOf("from public.services\n  where id = p_service_id\n  for update");
  const conflictIndex = sql.indexOf("into v_resource_conflicts");
  const insertIndex = sql.indexOf("insert into public.bookings");
  assert.ok(lockIndex >= 0);
  assert.ok(conflictIndex > lockIndex);
  assert.ok(insertIndex > conflictIndex);
});

test("racing experience presents premium telemetry and the shared public journey", async () => {
  const page = await readFile("apps/examples/racing-simulator/app/page.tsx", "utf8");
  const css = await readFile("apps/examples/racing-simulator/app/globals.css", "utf8");
  assert.match(page, /PublicBookingJourney/u);
  assert.match(page, /Direct-drive rigs/u);
  assert.match(css, /\.apex-telemetry/u);
  assert.match(css, /prefers-reduced-motion/u);
});
