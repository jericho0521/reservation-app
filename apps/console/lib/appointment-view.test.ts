import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { ReservationResponse } from "@reservation-platform/sdk";
import {
  canTransition,
  filterAppointments,
  nextAppointmentDate,
  transitionReasonRequired,
  validateAppointmentTransition,
} from "./appointment-view";

const appointments: ReservationResponse[] = [
  { reservation_id: "a-late", venue_id: "venue-a", service_id: "service-a", staff_id: "staff-b", status: "confirmed", date: "2026-07-15", start_time: "11:00", end_time: "11:30", quantity: 1 },
  { reservation_id: "a-early", venue_id: "venue-a", service_id: "service-a", staff_id: "staff-a", status: "pending", date: "2026-07-15", start_time: "09:00", end_time: "09:30", quantity: 1 },
  { reservation_id: "b-private", venue_id: "venue-b", service_id: "service-a", staff_id: "staff-a", status: "confirmed", date: "2026-07-15", start_time: "10:00", end_time: "10:30", quantity: 1 },
  { reservation_id: "a-tomorrow", venue_id: "venue-a", service_id: "service-a", staff_id: "staff-a", status: "confirmed", date: "2026-07-16", start_time: "09:00", end_time: "09:30", quantity: 1 },
  { reservation_id: "scoped-legacy", service_id: "service-a", status: "confirmed", date: "2026-07-15", start_time: "12:00", end_time: "12:30", quantity: 1 },
];

test("appointment transitions are explicit and terminal states stay terminal", () => {
  assert.equal(canTransition("pending", "confirmed"), true);
  assert.equal(canTransition("confirmed", "completed"), true);
  assert.equal(canTransition("confirmed", "no_show"), true);
  assert.equal(canTransition("cancelled", "confirmed"), false);
  assert.equal(canTransition("completed", "no_show"), false);
  assert.equal(canTransition("no_show", "confirmed"), false);
});

test("cancellation and no-show transitions require an audit reason", () => {
  assert.equal(transitionReasonRequired("cancelled"), true);
  assert.equal(transitionReasonRequired("no_show"), true);
  assert.equal(transitionReasonRequired("confirmed"), false);
  assert.equal(validateAppointmentTransition("confirmed", "no_show", ""), "An audit reason is required for this status change.");
  assert.equal(validateAppointmentTransition("pending", "completed", "Finished"), "The appointment cannot move from Pending to Completed.");
  assert.equal(validateAppointmentTransition("confirmed", "completed", ""), undefined);
});

test("daily filters never include appointments outside authorized locations", () => {
  assert.deepEqual(filterAppointments(appointments, {
    date: "2026-07-15",
    venueId: "venue-a",
    practitionerId: "staff-a",
    status: "pending",
    authorizedVenueIds: ["venue-a"],
  }).map((appointment) => appointment.reservation_id), ["a-early"]);

  assert.deepEqual(filterAppointments(appointments, {
    date: "2026-07-15",
    venueId: "venue-b",
    authorizedVenueIds: ["venue-a"],
  }), []);
});

test("daily appointments are ordered by start time and date navigation is timezone-neutral", () => {
  assert.deepEqual(filterAppointments(appointments, {
    date: "2026-07-15",
    venueId: "venue-a",
    authorizedVenueIds: ["venue-a"],
  }).map((appointment) => appointment.reservation_id), ["a-early", "a-late", "scoped-legacy"]);
  assert.equal(nextAppointmentDate("2026-07-15", -1), "2026-07-14");
  assert.equal(nextAppointmentDate("2026-07-15", 1), "2026-07-16");
});

test("command center exposes every lifecycle state and audited mutations", async () => {
  const [page, detail, filters, actions] = await Promise.all([
    readFile(new URL("../app/reservations/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reservations/[reservationId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/reservations/reservation-filters.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reservations/actions.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /AppointmentCalendar/u);
  assert.match(filters, /name="date"/u);
  assert.match(filters, /name="location"/u);
  assert.match(filters, /name="practitioner"/u);
  assert.match(filters, /pending/u);
  assert.match(filters, /no_show/u);
  assert.match(detail, /AppointmentStatusActions/u);
  assert.match(actions, /expected_status/u);
  assert.match(actions, /transition_reason/u);
  assert.match(actions, /revalidatePath\("\/analytics"\)/u);
});
