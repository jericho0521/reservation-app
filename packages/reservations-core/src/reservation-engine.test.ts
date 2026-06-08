import assert from "node:assert/strict";
import test from "node:test";
import {
  createAssignedResourcePolicy,
  createCapacityPolicy,
  generateAvailabilityTimeSlots,
  getCapacityResult,
  getConflictingResourceLabels,
  getMaintenanceResourceConflicts,
  validateReservationRequest,
  type Reservation,
  type ReservationService,
  type ReservableResource,
} from "./index";

function makeReservation(overrides: Partial<Reservation>): Reservation {
  return {
    id: "booking-1",
    service_id: "service-1",
    customer_name: "Customer",
    customer_email: "customer@example.com",
    booking_date: "2026-06-08",
    start_time: "14:00",
    end_time: "15:00",
    quantity: 1,
    items: [],
    interface_type: "form",
    seats_booked: 1,
    seat_labels: [],
    ...overrides,
  };
}

function makeService(overrides: Partial<ReservationService>): ReservationService {
  return {
    id: "service-1",
    name: "Movie Hall",
    resource_kind: "seat",
    selection_mode: "assigned_resource",
    policy: createAssignedResourcePolicy(4),
    layout: { kind: "none" },
    total_seats: 4,
    resources: ["A1", "A2", "B1", "B2"].map((label) => ({
      id: label,
      service_id: "service-1",
      label,
      kind: "seat",
      is_active: true,
      capacity: 1,
    })),
    ...overrides,
  };
}

test("capacity-only service tracks quantity without resource labels", () => {
  const service = makeService({
    name: "Playstation 5",
    resource_kind: "capacity_bucket",
    selection_mode: "quantity",
    policy: createCapacityPolicy(2),
    resources: [{
      id: "ps5-capacity",
      service_id: "service-1",
      label: "PS5 Capacity",
      kind: "capacity_bucket",
      is_active: true,
      capacity: 2,
    }],
    total_seats: 2,
  });
  const reservations = [
    makeReservation({ quantity: 1, seats_booked: 1 }),
  ];

  assert.equal(getCapacityResult(service, reservations).available_quantity, 1);
});

test("racing simulator resources can preserve legacy fallback labels", () => {
  const service = makeService({
    name: "Racing Simulator",
    resource_kind: "station",
    selection_mode: "assigned_resource",
    policy: createAssignedResourcePolicy(16),
    resources: Array.from({ length: 16 }, (_, index) => {
      const label = `RS${index + 1}`;

      return {
        id: label,
        service_id: "service-1",
        label,
        kind: "station",
        is_active: true,
        capacity: 1,
      } satisfies ReservableResource;
    }),
    total_seats: 16,
  });
  const slots = generateAvailabilityTimeSlots(service, [
    makeReservation({
      quantity: 2,
      items: [],
      seats_booked: 2,
      seat_labels: [],
    }),
  ], {
    legacyFallbackLabels: Array.from({ length: 16 }, (_, index) => `RS${index + 1}`),
  });

  const slot = slots.find((item) => item.start_time === "14:00");
  assert.equal(slot?.available_quantity, 14);
  assert.deepEqual(slot?.taken_resource_labels, ["RS1", "RS2"]);
});

test("assigned-resource service reports unavailable generic labels", () => {
  const service = makeService({});
  const slots = generateAvailabilityTimeSlots(service, [
    makeReservation({
      quantity: 2,
      items: [
        { resource_label: "A1", quantity: 1 },
        { resource_label: "B12", quantity: 1 },
      ],
      seats_booked: 2,
      seat_labels: ["A1", "B12"],
    }),
  ]);

  const slot = slots.find((item) => item.start_time === "14:00");
  assert.equal(slot?.available_quantity, 2);
  assert.deepEqual(slot?.taken_resource_labels, ["A1", "B12"]);
});

test("maintenance resources reduce availability without requiring RS labels", () => {
  const service = makeService({});
  const slots = generateAvailabilityTimeSlots(service, [], {
    maintenanceResourceLabels: ["A2"],
  });

  const slot = slots.find((item) => item.start_time === "12:00");
  assert.equal(slot?.available_quantity, 3);
  assert.deepEqual(slot?.maintenance_resource_labels, ["A2"]);
  assert.deepEqual(getMaintenanceResourceConflicts(["A1", "A2"], ["A2"]), ["A2"]);
});

test("conflicting resources are detected by exact labels", () => {
  const existingReservations = [
    makeReservation({
      items: [{ resource_label: "B12", quantity: 1 }],
      seat_labels: ["B12"],
    }),
  ];
  const requestedReservation = makeReservation({
    quantity: 1,
    items: [{ resource_label: "B12", quantity: 1 }],
    seat_labels: ["B12"],
  });

  assert.deepEqual(getConflictingResourceLabels(existingReservations, ["A1", "B12"]), ["B12"]);
  assert.deepEqual(validateReservationRequest(
    makeService({}),
    existingReservations,
    requestedReservation,
  ), {
    ok: false,
    error: "resource_conflict",
    conflicting_resource_labels: ["B12"],
  });
});

test("legacy booking rows with seat_labels are adapted into resource availability", () => {
  const service = makeService({});
  const slots = generateAvailabilityTimeSlots(service, [
    makeReservation({
      quantity: 2,
      items: [],
      seats_booked: 2,
      seat_labels: ["A1", "B2"],
    }),
  ]);

  const slot = slots.find((item) => item.start_time === "14:00");
  assert.equal(slot?.available_quantity, 2);
  assert.deepEqual(slot?.taken_resource_labels, ["A1", "B2"]);
});
