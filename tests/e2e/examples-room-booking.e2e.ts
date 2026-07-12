import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  createHybridPolicy,
  generateAvailabilityTimeSlots,
  type Reservation,
  type ReservationService,
} from "../../packages/reservations-core/src/index.ts";

const exampleRoot = path.resolve("apps/examples/room-booking");

test("room booking example is wired to the reusable frontend modules", async () => {
  const packageJson = JSON.parse(await readFile(path.join(exampleRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const pageSource = await readFile(path.join(exampleRoot, "app/page.tsx"), "utf8");
  const configSource = await readFile(path.join(exampleRoot, "reservation.config.ts"), "utf8");

  assert.equal(packageJson.dependencies?.["@reservation-platform/react"], "workspace:*");
  assert.equal(packageJson.dependencies?.["@reservation-platform/ui"], "workspace:*");
  assert.match(pageSource, /<PublicBookingJourney/u);
  assert.match(configSource, /NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL/u);
  assert.match(configSource, /northstar-rooms/u);
});

test("room seed defines capacities, equipment, maintenance, and an existing meeting", async () => {
  const sql = await readFile("packages/database/seeds/rooms-demo.sql", "utf8");
  assert.match(sql, /'northstar-rooms'/u);
  assert.match(sql, /'Boardroom', 'room', 10/u);
  assert.match(sql, /Dual Display/u);
  assert.match(sql, /'Focus Room'[\s\S]*'Display replacement'/u);
  assert.match(sql, /'Boardroom'[\s\S]*'confirmed'/u);
});

test("maintenance and existing meetings remove room capacity and labels", () => {
  const service: ReservationService = {
    id: "room-service",
    name: "Northstar Meeting Rooms",
    resource_kind: "room",
    selection_mode: "hybrid",
    policy: createHybridPolicy(20),
    layout: { kind: "grid" },
    total_seats: 20,
    resources: [
      { id: "focus", service_id: "room-service", label: "Focus Room", kind: "room", is_active: true, capacity: 4 },
      { id: "studio", service_id: "room-service", label: "Studio Room", kind: "room", is_active: true, capacity: 6 },
      { id: "board", service_id: "room-service", label: "Boardroom", kind: "room", is_active: true, capacity: 10 },
    ],
  };
  const meeting: Reservation = {
    id: "meeting-1",
    service_id: service.id,
    customer_name: "Organizer",
    customer_email: "organizer@example.invalid",
    booking_date: "2026-08-03",
    start_time: "10:00",
    end_time: "11:00",
    quantity: 6,
    items: [{ resource_label: "Boardroom", quantity: 6 }],
    interface_type: "form",
    seats_booked: 6,
    seat_labels: ["Boardroom"],
  };
  const slot = generateAvailabilityTimeSlots(service, [meeting], {
    maintenanceResourceLabels: ["Focus Room"],
    operatingWindows: [{ start_time: "10:00", end_time: "12:00", interval_minutes: 30 }],
    durationMinutes: 60,
  }).find((candidate) => candidate.start_time === "10:00");

  assert.equal(slot?.available_quantity, 10);
  assert.ok(slot?.taken_resource_labels.includes("Boardroom"));
  assert.ok(slot?.maintenance_resource_labels.includes("Focus Room"));
});

test("room experience includes search, capacity guidance, and confirmation styling", async () => {
  const page = await readFile(path.join(exampleRoot, "app/page.tsx"), "utf8");
  const css = await readFile(path.join(exampleRoot, "app/globals.css"), "utf8");
  const sharedUi = await readFile("packages/reservation-ui/src/components.tsx", "utf8");
  assert.match(page, /Enter the attendee count first/u);
  assert.match(sharedUi, /No services match that search/u);
  assert.match(sharedUi, /Reservation created successfully/u);
  assert.match(css, /\.northstar-success/u);
});

test("room booking example page responds when an app URL is configured", async (context) => {
  const rawUrl = process.env.ROOM_BOOKING_E2E_BASE_URL;
  if (!rawUrl) {
    context.skip("Set ROOM_BOOKING_E2E_BASE_URL to run the live room-booking page check.");
    return;
  }

  const response = await fetch(new URL("/", rawUrl), {
    signal: AbortSignal.timeout(readTimeoutMs()),
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Room|Booking|backend configuration|required/i);
});

function readTimeoutMs() {
  const value = Number(process.env.ROOM_BOOKING_E2E_TIMEOUT_MS ?? process.env.RESERVATION_SMOKE_TIMEOUT_MS ?? "5000");
  return Number.isFinite(value) && value > 0 ? value : 5000;
}
