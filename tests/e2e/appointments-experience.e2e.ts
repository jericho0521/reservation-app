import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createAssignedResourcePolicy,
  generateAvailabilityTimeSlots,
  type Reservation,
  type ReservationService,
} from "../../packages/reservations-core/src/index.ts";

test("appointments seed defines specialists, duration, staff hours, and an overlap", async () => {
  const sql = await readFile("packages/database/seeds/appointments-demo.sql", "utf8");
  assert.match(sql, /'luma-studio'/u);
  assert.match(sql, /"duration_minutes":45/u);
  assert.match(sql, /'Amina'[\s\S]*'Jules'[\s\S]*'Suki'/u);
  assert.match(sql, /'09:00', '18:00'/u);
  assert.match(sql, /'11:00'[\s\S]*'11:45'/u);
});

test("staff schedule bounds slots and an overlapping appointment removes its specialist", () => {
  const service: ReservationService = {
    id: "appointment-service",
    name: "Signature Consultation",
    resource_kind: "custom",
    selection_mode: "assigned_resource",
    policy: createAssignedResourcePolicy(3),
    layout: { kind: "none" },
    total_seats: 3,
    resources: ["Amina", "Jules", "Suki"].map((label) => ({
      id: label,
      service_id: "appointment-service",
      label,
      kind: "custom",
      is_active: true,
      capacity: 1,
    })),
  };
  const appointment: Reservation = {
    id: "appointment-1",
    service_id: service.id,
    customer_name: "Client",
    customer_email: "client@example.invalid",
    booking_date: "2026-08-04",
    start_time: "11:00",
    end_time: "11:45",
    quantity: 1,
    items: [{ resource_label: "Amina", quantity: 1 }],
    interface_type: "form",
    seats_booked: 1,
    seat_labels: ["Amina"],
  };
  const slots = generateAvailabilityTimeSlots(service, [appointment], {
    operatingWindows: [{ start_time: "09:00", end_time: "12:00", interval_minutes: 15 }],
    durationMinutes: 45,
  });

  assert.equal(slots[0]?.start_time, "09:00");
  assert.equal(slots.at(-1)?.end_time, "12:00");
  assert.deepEqual(
    slots.filter((slot) => slot.taken_resource_labels.includes("Amina")).map((slot) => slot.start_time),
    ["10:30", "10:45", "11:00", "11:15"],
  );
});

test("appointments experience is a polished shared public booking journey", async () => {
  const page = await readFile("apps/examples/appointments/app/page.tsx", "utf8");
  const css = await readFile("apps/examples/appointments/app/globals.css", "utf8");
  assert.match(page, /PublicBookingJourney/u);
  assert.match(page, /People who know/u);
  assert.match(page, /specialist’s working schedule/u);
  assert.match(css, /\.luma-specialists/u);
  assert.match(css, /prefers-reduced-motion/u);
});
