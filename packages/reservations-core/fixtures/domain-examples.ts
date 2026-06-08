import {
  createAssignedResourcePolicy,
  createCapacityPolicy,
  type Reservation,
  type ReservationService,
  type ReservableResource,
} from "../src/index";

const exampleDate = "2026-06-08";

function makeResource(
  serviceId: string,
  label: string,
  kind: ReservableResource["kind"],
  metadata?: Record<string, unknown>,
): ReservableResource {
  return {
    id: `${serviceId}-${label.toLowerCase()}`,
    service_id: serviceId,
    label,
    kind,
    is_active: true,
    capacity: 1,
    metadata,
  };
}

function makeReservation(
  overrides: Partial<Reservation> & Pick<Reservation, "service_id" | "quantity">,
): Reservation {
  return {
    id: `${overrides.service_id}-reservation`,
    customer_name: "Example Customer",
    customer_email: "customer@example.com",
    booking_date: exampleDate,
    start_time: "14:00",
    end_time: "15:00",
    items: [],
    interface_type: "form",
    seats_booked: overrides.quantity,
    seat_labels: [],
    ...overrides,
  };
}

export const racingSimulatorFixture = {
  service: {
    id: "racing-simulator",
    name: "Racing Simulator",
    resource_kind: "station",
    selection_mode: "assigned_resource",
    policy: createAssignedResourcePolicy(16),
    layout: { kind: "grid", columns: 4, rows: 4, group_label: "Simulator Bay" },
    total_seats: 16,
    resources: Array.from({ length: 16 }, (_, index) =>
      makeResource("racing-simulator", `RS${index + 1}`, "station", {
        bay: Math.floor(index / 4) + 1,
      }),
    ),
  } satisfies ReservationService,
  existingReservations: [
    makeReservation({
      service_id: "racing-simulator",
      quantity: 2,
      items: [
        { resource_label: "RS1", quantity: 1 },
        { resource_label: "RS2", quantity: 1 },
      ],
      seats_booked: 2,
      seat_labels: ["RS1", "RS2"],
    }),
  ],
  requestedReservation: makeReservation({
    service_id: "racing-simulator",
    quantity: 1,
    items: [{ resource_label: "RS3", quantity: 1 }],
    seats_booked: 1,
    seat_labels: ["RS3"],
  }),
};

export const ps5QuantityFixture = {
  service: {
    id: "ps5-lounge",
    name: "Playstation 5 Lounge",
    resource_kind: "capacity_bucket",
    selection_mode: "quantity",
    policy: createCapacityPolicy(4),
    layout: { kind: "none" },
    total_seats: 4,
    resources: [
      {
        id: "ps5-lounge-capacity",
        service_id: "ps5-lounge",
        label: "Console capacity",
        kind: "capacity_bucket",
        is_active: true,
        capacity: 4,
      },
    ],
  } satisfies ReservationService,
  existingReservations: [
    makeReservation({
      service_id: "ps5-lounge",
      quantity: 2,
      items: [{ quantity: 2 }],
      seats_booked: 2,
      seat_labels: [],
    }),
  ],
  requestedReservation: makeReservation({
    service_id: "ps5-lounge",
    quantity: 1,
    items: [{ quantity: 1 }],
    seats_booked: 1,
    seat_labels: [],
  }),
};

export const movieTicketingFixture = {
  service: {
    id: "movie-screening-7pm",
    name: "Movie Screening 7 PM",
    resource_kind: "seat",
    selection_mode: "assigned_resource",
    policy: createAssignedResourcePolicy(6),
    layout: { kind: "grid", columns: 3, rows: 2, group_label: "Screen 1" },
    total_seats: 6,
    resources: ["A1", "A2", "A3", "B1", "B2", "B3"].map((label) =>
      makeResource("movie-screening-7pm", label, "seat", {
        row: label[0],
      }),
    ),
  } satisfies ReservationService,
  existingReservations: [
    makeReservation({
      service_id: "movie-screening-7pm",
      quantity: 2,
      items: [
        { resource_label: "A1", quantity: 1 },
        { resource_label: "A2", quantity: 1 },
      ],
      seats_booked: 2,
      seat_labels: ["A1", "A2"],
    }),
  ],
  requestedReservation: makeReservation({
    service_id: "movie-screening-7pm",
    quantity: 2,
    items: [
      { resource_label: "B1", quantity: 1 },
      { resource_label: "B2", quantity: 1 },
    ],
    seats_booked: 2,
    seat_labels: ["B1", "B2"],
  }),
};

export const reservationDomainFixtures = [
  racingSimulatorFixture,
  ps5QuantityFixture,
  movieTicketingFixture,
];
