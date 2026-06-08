import assert from "node:assert/strict";

import {
  createAssignedResourcePolicy,
  createCapacityPolicy,
  generateAvailabilityTimeSlots,
  validateReservationRequest,
  type Reservation,
  type ReservationService,
  type ReservableResource,
} from "@project-play/reservations-core";
import {
  createSupabaseReservationRepository,
  type SupabaseAtomicReservationErrorCode,
} from "@project-play/reservations-supabase";

const bookingDate = "2026-06-08";

function makeResource(
  serviceId: string,
  label: string,
  kind: ReservableResource["kind"],
): ReservableResource {
  return {
    id: `${serviceId}-${label.toLowerCase()}`,
    service_id: serviceId,
    label,
    kind,
    is_active: true,
    capacity: 1,
  };
}

function makeReservation(
  overrides: Partial<Reservation> & Pick<Reservation, "service_id" | "quantity">,
): Reservation {
  return {
    customer_name: "External Consumer",
    customer_email: "consumer@example.com",
    booking_date: bookingDate,
    start_time: "14:00",
    end_time: "15:00",
    interface_type: "form",
    items: [],
    seats_booked: overrides.quantity,
    seat_labels: [],
    ...overrides,
  };
}

function smokeCoreDomain(
  label: string,
  service: ReservationService,
  existingReservations: Reservation[],
  requestedReservation: Reservation,
) {
  const slots = generateAvailabilityTimeSlots(service, existingReservations);
  const validation = validateReservationRequest(
    service,
    existingReservations,
    requestedReservation,
  );

  assert.ok(slots.length > 0, `${label} should generate availability slots`);
  assert.equal(validation.ok, true, `${label} request should validate`);
}

const racingService: ReservationService = {
  id: "racing-simulator",
  name: "Racing Simulator",
  resource_kind: "station",
  selection_mode: "assigned_resource",
  policy: createAssignedResourcePolicy(3),
  layout: { kind: "grid", columns: 3, rows: 1 },
  total_seats: 3,
  resources: ["RS1", "RS2", "RS3"].map((label) =>
    makeResource("racing-simulator", label, "station"),
  ),
};

smokeCoreDomain(
  "Racing Simulator",
  racingService,
  [
    makeReservation({
      service_id: "racing-simulator",
      quantity: 1,
      items: [{ resource_label: "RS1", quantity: 1 }],
      seat_labels: ["RS1"],
    }),
  ],
  makeReservation({
    service_id: "racing-simulator",
    quantity: 1,
    items: [{ resource_label: "RS2", quantity: 1 }],
    seat_labels: ["RS2"],
  }),
);

const ps5Service: ReservationService = {
  id: "ps5-lounge",
  name: "Playstation 5 Lounge",
  resource_kind: "capacity_bucket",
  selection_mode: "quantity",
  policy: createCapacityPolicy(4),
  layout: { kind: "none" },
  total_seats: 4,
  resources: [makeResource("ps5-lounge", "Console capacity", "capacity_bucket")],
};

smokeCoreDomain(
  "PS5 quantity booking",
  ps5Service,
  [
    makeReservation({
      service_id: "ps5-lounge",
      quantity: 2,
      items: [{ quantity: 2 }],
    }),
  ],
  makeReservation({
    service_id: "ps5-lounge",
    quantity: 1,
    items: [{ quantity: 1 }],
  }),
);

const movieService: ReservationService = {
  id: "movie-screening-7pm",
  name: "Movie Screening 7 PM",
  resource_kind: "seat",
  selection_mode: "assigned_resource",
  policy: createAssignedResourcePolicy(4),
  layout: { kind: "grid", columns: 2, rows: 2 },
  total_seats: 4,
  resources: ["A1", "A2", "B1", "B2"].map((label) =>
    makeResource("movie-screening-7pm", label, "seat"),
  ),
};

smokeCoreDomain(
  "Movie ticketing",
  movieService,
  [
    makeReservation({
      service_id: "movie-screening-7pm",
      quantity: 1,
      items: [{ resource_label: "A1", quantity: 1 }],
      seat_labels: ["A1"],
    }),
  ],
  makeReservation({
    service_id: "movie-screening-7pm",
    quantity: 2,
    items: [
      { resource_label: "B1", quantity: 1 },
      { resource_label: "B2", quantity: 1 },
    ],
    seat_labels: ["B1", "B2"],
  }),
);

const rpcCalls: Array<{ fn: string; params?: Record<string, unknown> }> = [];
const mockSupabaseClient = {
  from() {
    throw new Error("from() should not be called by this smoke test");
  },
  async rpc(fn: string, params?: Record<string, unknown>) {
    rpcCalls.push({ fn, params });
    return {
      data: {
        ok: false,
        error_code: "resource_conflict" satisfies SupabaseAtomicReservationErrorCode,
        message: "Requested resource is already booked",
        conflicting_resource_labels: ["RS2"],
      },
      error: null,
    };
  },
};

const repository = createSupabaseReservationRepository(mockSupabaseClient);
const atomicResult = await repository.createReservationAtomic({
  reservation: makeReservation({
    service_id: "racing-simulator",
    quantity: 1,
    items: [{ resource_label: "RS2", quantity: 1 }],
    seat_labels: ["RS2"],
  }),
});

assert.equal(rpcCalls[0]?.fn, "create_reservation_atomic");
assert.deepEqual(Object.keys(rpcCalls[0]?.params ?? {}), ["payload"]);
assert.equal(atomicResult.ok, false);
assert.equal(atomicResult.error, "resource_conflict");
assert.deepEqual(atomicResult.validation.conflicting_resource_labels, ["RS2"]);

console.log("External consumer smoke passed");
