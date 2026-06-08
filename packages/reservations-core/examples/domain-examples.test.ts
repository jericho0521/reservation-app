import assert from "node:assert/strict";
import test from "node:test";

import {
  generateAvailabilityTimeSlots,
  getCapacityResult,
  getConflictingResourceLabels,
  validateReservationRequest,
} from "../src/index";
import {
  movieTicketingFixture,
  ps5QuantityFixture,
  racingSimulatorFixture,
  reservationDomainFixtures,
} from "../fixtures/domain-examples";
import {
  getExampleAvailability,
  validateExampleBooking,
} from "./host-consumers";

test("domain fixtures use the same core availability and validation functions", () => {
  for (const fixture of reservationDomainFixtures) {
    const slots = generateAvailabilityTimeSlots(
      fixture.service,
      fixture.existingReservations,
    );
    const slot = slots.find((item) => item.start_time === "14:00");
    const validation = validateReservationRequest(
      fixture.service,
      fixture.existingReservations,
      fixture.requestedReservation,
    );

    assert.ok(slot, `${fixture.service.name} should generate a 14:00 slot`);
    assert.equal(validation.ok, true, `${fixture.service.name} should validate`);
  }
});

test("movie ticketing assigned seats need no movie-specific core behavior", () => {
  const slots = generateAvailabilityTimeSlots(
    movieTicketingFixture.service,
    movieTicketingFixture.existingReservations,
  );
  const slot = slots.find((item) => item.start_time === "14:00");

  assert.equal(movieTicketingFixture.service.resource_kind, "seat");
  assert.equal(movieTicketingFixture.service.selection_mode, "assigned_resource");
  assert.deepEqual(slot?.taken_resource_labels, ["A1", "A2"]);
  assert.equal(slot?.available_quantity, 4);
  assert.deepEqual(
    getConflictingResourceLabels(
      movieTicketingFixture.existingReservations,
      ["A1"],
    ),
    ["A1"],
  );
});

test("PS5 quantity booking tracks capacity without fake resource labels", () => {
  const capacity = getCapacityResult(
    ps5QuantityFixture.service,
    ps5QuantityFixture.existingReservations,
  );
  const validation = validateReservationRequest(
    ps5QuantityFixture.service,
    ps5QuantityFixture.existingReservations,
    ps5QuantityFixture.requestedReservation,
  );

  assert.equal(ps5QuantityFixture.service.selection_mode, "quantity");
  assert.deepEqual(ps5QuantityFixture.existingReservations[0]?.seat_labels, []);
  assert.deepEqual(
    ps5QuantityFixture.requestedReservation.items,
    [{ quantity: 1 }],
  );
  assert.equal(capacity.available_quantity, 2);
  assert.equal(validation.ok, true);
});

test("racing simulator is ordinary assigned-resource data", () => {
  const slots = generateAvailabilityTimeSlots(
    racingSimulatorFixture.service,
    racingSimulatorFixture.existingReservations,
  );
  const slot = slots.find((item) => item.start_time === "14:00");

  assert.equal(racingSimulatorFixture.service.resource_kind, "station");
  assert.equal(racingSimulatorFixture.service.selection_mode, "assigned_resource");
  assert.equal(racingSimulatorFixture.service.resources?.length, 16);
  assert.deepEqual(slot?.taken_resource_labels, ["RS1", "RS2"]);
  assert.equal(slot?.available_quantity, 14);
});

test("host consumer examples call availability and booking validation uniformly", () => {
  const availability = getExampleAvailability(
    movieTicketingFixture.service,
    movieTicketingFixture.existingReservations,
  );
  const validation = validateExampleBooking(
    movieTicketingFixture.service,
    movieTicketingFixture.existingReservations,
    movieTicketingFixture.requestedReservation,
  );

  assert.equal(availability.service.id, "movie-screening-7pm");
  assert.ok(availability.slots.some((slot) => slot.start_time === "14:00"));
  assert.deepEqual(validation, { ok: true });
});
