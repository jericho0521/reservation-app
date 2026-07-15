import assert from "node:assert/strict";
import test from "node:test";
import {
  createAssignedResourcePolicy,
  createCapacityPolicy,
  generateAvailabilityTimeSlots,
  getCapacityResult,
  getConflictingResourceLabels,
  getMaintenanceResourceConflicts,
  hasAppointmentConflict,
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

test("room availability subtracts attendee capacity for meetings and maintenance", () => {
  const service = makeService({
    name: "Meeting rooms",
    resource_kind: "room",
    selection_mode: "hybrid",
    resources: [
      { id: "focus", service_id: "service-1", label: "Focus", kind: "room", is_active: true, capacity: 4 },
      { id: "boardroom", service_id: "service-1", label: "Boardroom", kind: "room", is_active: true, capacity: 10 },
    ],
    total_seats: 14,
  });
  const slots = generateAvailabilityTimeSlots(service, [makeReservation({
    quantity: 6,
    items: [{ resource_label: "Boardroom", quantity: 6 }],
    seat_labels: ["Boardroom"],
  })], { maintenanceResourceLabels: ["Focus"] });

  const slot = slots.find((candidate) => candidate.start_time === "14:00");
  assert.equal(slot?.available_quantity, 4);
  assert.deepEqual(slot?.taken_resource_labels, ["Boardroom", "Focus"]);
  assert.deepEqual(slot?.maintenance_resource_labels, ["Focus"]);
});

test("availability generates interval slots inside configured local windows", () => {
  const slots = generateAvailabilityTimeSlots(makeService({}), [], {
    operatingWindows: [{ start_time: "09:00", end_time: "11:00", interval_minutes: 30 }],
    durationMinutes: 60,
  });

  assert.deepEqual(slots.map((slot) => [slot.start_time, slot.end_time]), [
    ["09:00", "10:00"],
    ["09:30", "10:30"],
    ["10:00", "11:00"],
  ]);
});

test("staff buffer blocks an otherwise adjacent appointment", () => {
  assert.equal(hasAppointmentConflict({
    staff_id: "staff-1",
    start_time: "10:35",
    end_time: "11:05",
    buffer_before_minutes: 10,
  }, [{
    staff_id: "staff-1",
    start_time: "10:00",
    end_time: "10:30",
  }]), true);
});

test("the same buffered interval remains available for another practitioner", () => {
  const slots = generateAvailabilityTimeSlots(makeService({ total_seats: 1 }), [makeReservation({
    staff_id: "staff-1",
    start_time: "10:00",
    end_time: "10:30",
  })], {
    operatingWindows: [{ start_time: "10:00", end_time: "11:00", interval_minutes: 30 }],
    durationMinutes: 30,
    staffId: "staff-2",
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 10,
  });

  assert.equal(slots[0]?.is_available, true);
  assert.equal(slots[0]?.staff_id, "staff-2");
});

test("staff buffers remove overlapping adjacent slots for the same practitioner", () => {
  const slots = generateAvailabilityTimeSlots(makeService({ total_seats: 4 }), [makeReservation({
    staff_id: "staff-1",
    start_time: "10:30",
    end_time: "11:00",
  })], {
    operatingWindows: [{ start_time: "09:30", end_time: "11:30", interval_minutes: 30 }],
    durationMinutes: 30,
    staffId: "staff-1",
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 10,
  });

  assert.deepEqual(slots.filter((slot) => !slot.is_available).map((slot) => slot.start_time), [
    "10:00",
    "10:30",
    "11:00",
  ]);
  assert.deepEqual(slots.filter((slot) => !slot.is_available).map((slot) => slot.available_quantity), [0, 0, 0]);
});

test("cross-service practitioner conflicts use each service's buffers", () => {
  const slots = generateAvailabilityTimeSlots(makeService({ total_seats: 2 }), [makeReservation({
    service_id: "other-service",
    staff_id: "staff-1",
    start_time: "10:00",
    end_time: "10:30",
    buffer_after_minutes: 20,
  })], {
    operatingWindows: [{ start_time: "10:45", end_time: "11:15", interval_minutes: 30 }],
    durationMinutes: 30,
    staffId: "staff-1",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 5,
  });

  assert.equal(slots[0]?.available_quantity, 0);
  assert.equal(slots[0]?.is_available, false);
});

test("a selected practitioner under maintenance has no available capacity", () => {
  const [slot] = generateAvailabilityTimeSlots(makeService({ total_seats: 4 }), [], {
    operatingWindows: [{ start_time: "10:00", end_time: "10:30", interval_minutes: 30 }],
    durationMinutes: 30,
    staffId: "staff-1",
    staffUnavailable: true,
  });

  assert.equal(slot?.available_quantity, 0);
  assert.equal(slot?.is_available, false);
});

test("overlapping appointments mark a specialist unavailable across interval starts", () => {
  const service = makeService({
    total_seats: 2,
    resources: ["Amina", "Jules"].map((label) => ({
      id: label,
      service_id: "service-1",
      label,
      kind: "custom",
      is_active: true,
      capacity: 1,
    })),
    policy: createAssignedResourcePolicy(2),
  });
  const slots = generateAvailabilityTimeSlots(service, [makeReservation({
    start_time: "11:00",
    end_time: "11:45",
    quantity: 1,
    items: [{ resource_label: "Amina", quantity: 1 }],
    seat_labels: ["Amina"],
  })], {
    operatingWindows: [{ start_time: "10:00", end_time: "12:00", interval_minutes: 15 }],
    durationMinutes: 45,
  });

  assert.deepEqual(
    slots.filter((slot) => slot.taken_resource_labels.includes("Amina")).map((slot) => slot.start_time),
    ["10:30", "10:45", "11:00", "11:15"],
  );
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
