import assert from "node:assert/strict";
import test from "node:test";
import {
  createAssignedResourcePolicy,
  createCapacityPolicy,
  type Reservation,
  type ReservationRepository,
  type ReservationService,
} from "@project-play/reservations-core";
import {
  CHECK_AVAILABILITY_TOOL_NAME,
  GET_SERVICES_TOOL_NAME,
  PREPARE_BOOKING_TOOL_NAME,
  bookingConfirmationActionFromPreparedBookingPayload,
  createReservationChatTools,
  type CheckAvailabilityToolResult,
  type PreparedBookingPayload,
  type ReservationChatToolErrorResult,
} from "./index.js";

const services: ReservationService[] = [
  {
    id: "racing-simulator",
    name: "Racing Simulator",
    description: "Assigned simulator stations.",
    total_seats: 4,
    resource_kind: "station",
    selection_mode: "assigned_resource",
    policy: createAssignedResourcePolicy(4),
    layout: { kind: "grid", columns: 2 },
    resources: [
      {
        id: "sim-1",
        service_id: "racing-simulator",
        label: "SIM 1",
        kind: "station",
        is_active: true,
      },
      {
        id: "sim-2",
        service_id: "racing-simulator",
        label: "SIM 2",
        kind: "station",
        is_active: true,
      },
      {
        id: "sim-3",
        service_id: "racing-simulator",
        label: "SIM 3",
        kind: "station",
        is_active: true,
      },
      {
        id: "sim-4",
        service_id: "racing-simulator",
        label: "SIM 4",
        kind: "station",
        is_active: true,
      },
    ],
  },
  {
    id: "ps5",
    name: "PS5",
    description: "Quantity-based console booking.",
    total_seats: 5,
    resource_kind: "capacity_bucket",
    selection_mode: "quantity",
    policy: createCapacityPolicy(5),
    layout: { kind: "none" },
  },
  {
    id: "movie-ticketing",
    name: "Movie Ticketing",
    description: "Screening tickets.",
    total_seats: 40,
    resource_kind: "screening",
    selection_mode: "quantity",
    policy: createCapacityPolicy(40),
    layout: { kind: "none" },
  },
];

const reservations: Reservation[] = [
  {
    service_id: "racing-simulator",
    customer_name: "Existing Driver",
    customer_email: "driver@example.com",
    booking_date: "2026-07-01",
    start_time: "14:00",
    end_time: "15:00",
    quantity: 1,
    items: [{ resource_label: "SIM 1", quantity: 1 }],
    status: "confirmed",
    interface_type: "chat",
    seats_booked: 1,
    seat_labels: ["SIM 1"],
  },
  {
    service_id: "ps5",
    customer_name: "Existing Player",
    customer_email: "player@example.com",
    booking_date: "2026-07-01",
    start_time: "14:00",
    end_time: "15:00",
    quantity: 3,
    items: [{ quantity: 3 }],
    status: "confirmed",
    interface_type: "form",
    seats_booked: 3,
    seat_labels: [],
  },
];

const repository: ReservationRepository = {
  async getService(serviceId) {
    return services.find((service) => service.id === serviceId) ?? null;
  },
  async getConfirmedReservations(lookup) {
    return reservations.filter(
      (reservation) =>
        reservation.service_id === lookup.serviceId &&
        reservation.booking_date === lookup.bookingDate &&
        reservation.status === "confirmed",
    );
  },
  async getMaintenanceResourceLabels(serviceId) {
    return serviceId === "racing-simulator" ? ["SIM 2"] : [];
  },
  async createReservation(input) {
    return input;
  },
};

function createTools() {
  return createReservationChatTools({
    repository,
    listServices: () => services,
    resolveServiceByName: (serviceName) =>
      services.find((service) =>
        service.name.toLowerCase().includes(serviceName.toLowerCase()),
      ) ?? null,
    clock: { now: () => new Date("2026-06-08T00:00:00.000Z") },
    availability: {
      operatingHours: [14, 15],
    },
  });
}

test("lists generic service metadata without host data access", async () => {
  const tool = createTools().find((candidate) => candidate.name === GET_SERVICES_TOOL_NAME);
  assert.ok(tool);

  const result = await tool.execute({});

  assert.deepEqual(result, {
    services: [
      {
        id: "racing-simulator",
        name: "Racing Simulator",
        description: "Assigned simulator stations.",
        total_capacity: 4,
        resource_kind: "station",
        selection_mode: "assigned_resource",
        reservation_policy: createAssignedResourcePolicy(4),
        resource_labels: ["SIM 1", "SIM 2", "SIM 3", "SIM 4"],
      },
      {
        id: "ps5",
        name: "PS5",
        description: "Quantity-based console booking.",
        total_capacity: 5,
        resource_kind: "capacity_bucket",
        selection_mode: "quantity",
        reservation_policy: createCapacityPolicy(5),
      },
      {
        id: "movie-ticketing",
        name: "Movie Ticketing",
        description: "Screening tickets.",
        total_capacity: 40,
        resource_kind: "screening",
        selection_mode: "quantity",
        reservation_policy: createCapacityPolicy(40),
      },
    ],
  });
});

test("checks assigned-resource availability with reservations and maintenance", async () => {
  const tool = createTools().find((candidate) => candidate.name === CHECK_AVAILABILITY_TOOL_NAME);
  assert.ok(tool);

  const result = await tool.execute({
    service_name: "Racing",
    date: "2026-07-01",
  });

  assert.deepEqual(result, {
    service_name: "Racing Simulator",
    service_id: "racing-simulator",
    date: "2026-07-01",
    current_date: "2026-06-08",
    total_capacity: 4,
    resource_kind: "station",
    selection_mode: "assigned_resource",
    reservation_policy: createAssignedResourcePolicy(4),
    available_slots: [
      {
        time: "14:00",
        start_time: "14:00",
        end_time: "15:00",
        available_quantity: 2,
        available_seats: 2,
        is_available: true,
        taken_resource_labels: ["SIM 1", "SIM 2"],
        maintenance_resource_labels: ["SIM 2"],
      },
      {
        time: "15:00",
        start_time: "15:00",
        end_time: "16:00",
        available_quantity: 3,
        available_seats: 3,
        is_available: true,
        taken_resource_labels: ["SIM 2"],
        maintenance_resource_labels: ["SIM 2"],
      },
    ],
  });
});

test("supports service-specific legacy fallback labels for unlabeled assigned-resource bookings", async () => {
  const legacyRepository: ReservationRepository = {
    ...repository,
    async getConfirmedReservations(lookup) {
      return [
        ...(await repository.getConfirmedReservations(lookup)),
        {
          service_id: "racing-simulator",
          customer_name: "Legacy Group",
          customer_email: "legacy@example.com",
          booking_date: "2026-07-01",
          start_time: "14:00",
          end_time: "15:00",
          quantity: 2,
          items: [{ quantity: 2 }],
          status: "confirmed",
          interface_type: "chat",
          seats_booked: 2,
          seat_labels: [],
        },
      ];
    },
  };
  const fallbackCalls: string[] = [];
  const tool = createReservationChatTools({
    repository: legacyRepository,
    listServices: () => services,
    resolveServiceByName: () =>
      services.find((service) => service.id === "racing-simulator") ?? null,
    availability: {
      operatingHours: [14],
      includeUnavailableSlots: true,
      legacyFallbackLabels: (service) => {
        fallbackCalls.push(service.name);

        return (service.resources ?? []).map((resource) => resource.label).reverse();
      },
    },
  }).find((candidate) => candidate.name === CHECK_AVAILABILITY_TOOL_NAME);
  assert.ok(tool);

  const result = await tool.execute({
    service_name: "Racing",
    date: "2026-07-01",
  }) as CheckAvailabilityToolResult;

  assert.deepEqual(fallbackCalls, ["Racing Simulator"]);
  assert.deepEqual(result.available_slots, [
    {
      time: "14:00",
      start_time: "14:00",
      end_time: "15:00",
      available_quantity: 0,
      available_seats: 0,
      is_available: false,
      taken_resource_labels: ["SIM 1", "SIM 2", "SIM 3", "SIM 4"],
      maintenance_resource_labels: ["SIM 2"],
    },
  ]);
});

test("checks quantity availability for PS5 and movie ticketing style services", async () => {
  const tool = createTools().find((candidate) => candidate.name === CHECK_AVAILABILITY_TOOL_NAME);
  assert.ok(tool);

  const ps5Result = await tool.execute({
    service_name: "PS5",
    date: "2026-07-01",
  }) as CheckAvailabilityToolResult;
  const movieResult = await tool.execute({
    service_name: "Movie",
    date: "2026-07-01",
  }) as CheckAvailabilityToolResult;

  assert.equal(ps5Result.available_slots[0].available_quantity, 2);
  assert.equal(ps5Result.available_slots[0].available_seats, 2);
  assert.equal(ps5Result.available_slots[1].available_quantity, 5);
  assert.equal(ps5Result.available_slots[1].available_seats, 5);
  assert.deepEqual(
    movieResult.available_slots.map((slot) => slot.available_quantity),
    [40, 40],
  );
  assert.deepEqual(
    movieResult.available_slots.map((slot) => slot.available_seats),
    [40, 40],
  );
});

test("rejects invalid availability dates before repository lookup", async () => {
  let resolveCalls = 0;
  const tools = createReservationChatTools({
    repository,
    listServices: () => services,
    resolveServiceByName: () => {
      resolveCalls += 1;
      return services[0] ?? null;
    },
  });
  const tool = tools.find((candidate) => candidate.name === CHECK_AVAILABILITY_TOOL_NAME);
  assert.ok(tool);

  assert.deepEqual(
    await tool.execute({ service_name: "PS5", date: "tomorrow" }),
    { error: "Invalid availability request" },
  );
  assert.deepEqual(
    await tool.execute({ service_name: "PS5", date: "2026-99-99" }),
    { error: "Invalid availability request" },
  );
  assert.equal(resolveCalls, 0);
});

test("filters fully booked quantity slots", async () => {
  const fullyBookedRepository: ReservationRepository = {
    ...repository,
    async getConfirmedReservations(lookup) {
      return [
        ...(await repository.getConfirmedReservations(lookup)),
        {
          service_id: "ps5",
          customer_name: "Existing Second Group",
          customer_email: "group@example.com",
          booking_date: "2026-07-01",
          start_time: "14:00",
          end_time: "15:00",
          quantity: 2,
          items: [{ quantity: 2 }],
          status: "confirmed",
          interface_type: "form",
          seats_booked: 2,
          seat_labels: [],
        },
      ];
    },
  };
  const tool = createReservationChatTools({
    repository: fullyBookedRepository,
    listServices: () => services,
    resolveServiceByName: () => services.find((service) => service.id === "ps5") ?? null,
    availability: { operatingHours: [14, 15] },
  }).find((candidate) => candidate.name === CHECK_AVAILABILITY_TOOL_NAME);
  assert.ok(tool);

  const result = await tool.execute({
    service_name: "PS5",
    date: "2026-07-01",
  }) as CheckAvailabilityToolResult;

  assert.deepEqual(
    result.available_slots.map((slot) => ({
      time: slot.time,
      available_quantity: slot.available_quantity,
    })),
    [{ time: "15:00", available_quantity: 5 }],
  );
});

test("filters all-maintenance and all-booked assigned-resource slots", async () => {
  const allMaintenanceRepository: ReservationRepository = {
    ...repository,
    async getMaintenanceResourceLabels() {
      return ["SIM 1", "SIM 2", "SIM 3", "SIM 4"];
    },
  };
  const allBookedRepository: ReservationRepository = {
    ...repository,
    async getConfirmedReservations() {
      return ["SIM 1", "SIM 2", "SIM 3", "SIM 4"].map((label) => ({
        service_id: "racing-simulator",
        customer_name: `Booked ${label}`,
        customer_email: "booked@example.com",
        booking_date: "2026-07-01",
        start_time: "14:00",
        end_time: "15:00",
        quantity: 1,
        items: [{ resource_label: label, quantity: 1 }],
        status: "confirmed",
        interface_type: "form",
        seats_booked: 1,
        seat_labels: [label],
      }));
    },
    async getMaintenanceResourceLabels() {
      return [];
    },
  };
  const baseInput = {
    listServices: () => services,
    resolveServiceByName: () =>
      services.find((service) => service.id === "racing-simulator") ?? null,
    availability: { operatingHours: [14] },
  };
  const allMaintenanceTool = createReservationChatTools({
    ...baseInput,
    repository: allMaintenanceRepository,
  }).find((candidate) => candidate.name === CHECK_AVAILABILITY_TOOL_NAME);
  const allBookedTool = createReservationChatTools({
    ...baseInput,
    repository: allBookedRepository,
  }).find((candidate) => candidate.name === CHECK_AVAILABILITY_TOOL_NAME);
  assert.ok(allMaintenanceTool);
  assert.ok(allBookedTool);

  const allMaintenanceResult = await allMaintenanceTool.execute({
    service_name: "Racing",
    date: "2026-07-01",
  }) as CheckAvailabilityToolResult;
  const allBookedResult = await allBookedTool.execute({
    service_name: "Racing",
    date: "2026-07-01",
  }) as CheckAvailabilityToolResult;

  assert.deepEqual(allMaintenanceResult.available_slots, []);
  assert.deepEqual(allBookedResult.available_slots, []);
});

test("prepares Phase 14 booking confirmation payload without creating a booking", async () => {
  const tool = createTools().find((candidate) => candidate.name === PREPARE_BOOKING_TOOL_NAME);
  assert.ok(tool);

  const result = await tool.execute({
    service_name: "PS5",
    date: "2026-07-01",
    start_time: "14:00",
    seats: 2,
    user_name: "Mo",
    user_email: "mo@example.com",
    user_phone: "+60 12-345 6789",
  }) as PreparedBookingPayload;

  assert.deepEqual(result, {
    ready_for_confirmation: true,
    service_name: "PS5",
    date: "2026-07-01",
    start_time: "14:00",
    seats: 2,
    user_name: "Mo",
    user_email: "mo@example.com",
    user_phone: "+60 12-345 6789",
  });
  assert.deepEqual(bookingConfirmationActionFromPreparedBookingPayload(result), {
    type: "booking_confirmation",
    data: {
      service: "PS5",
      date: "2026-07-01",
      time: "14:00",
      seats: 2,
      name: "Mo",
      email: "mo@example.com",
      phone: "+60 12-345 6789",
    },
  });
});

test("allows host-provided knowledge and location tools", async () => {
  const tools = createReservationChatTools({
    repository,
    listServices: () => services,
    resolveServiceByName: () => null,
    knowledgeTool: {
      retrieve: ({ query }) => ({ answer: `Knowledge for ${query}` }),
    },
    customTools: [
      {
        name: "get_location_directions",
        description: "Return host-owned location directions.",
        inputSchema: { type: "object", properties: {}, required: [] },
        execute: () => ({ address: "Host venue address" }),
      },
    ],
  });

  assert.ok(tools.find((tool) => tool.name === "search_knowledge"));
  assert.ok(tools.find((tool) => tool.name === "get_location_directions"));
  assert.deepEqual(
    await tools.find((tool) => tool.name === "search_knowledge")?.execute({
      query: "pricing",
    }),
    { answer: "Knowledge for pricing" },
  );
});

test("validates knowledge tool input before calling host retrieve", async () => {
  let retrieveCalls = 0;
  const tools = createReservationChatTools({
    repository,
    listServices: () => services,
    resolveServiceByName: () => null,
    knowledgeTool: {
      retrieve: ({ query }) => {
        retrieveCalls += 1;
        return { answer: `Knowledge for ${query}` };
      },
    },
  });
  const tool = tools.find((candidate) => candidate.name === "search_knowledge");
  assert.ok(tool);

  assert.deepEqual(
    await tool.execute({ query: "" }) as ReservationChatToolErrorResult,
    { error: "Invalid knowledge search request" },
  );
  assert.deepEqual(
    await tool.execute({ query: "   " }) as ReservationChatToolErrorResult,
    { error: "Invalid knowledge search request" },
  );
  assert.deepEqual(
    await tool.execute({}) as ReservationChatToolErrorResult,
    { error: "Invalid knowledge search request" },
  );
  assert.equal(retrieveCalls, 0);
  assert.deepEqual(await tool.execute({ query: " pricing " }), {
    answer: "Knowledge for pricing",
  });
  assert.equal(retrieveCalls, 1);
});

test("throws when a custom tool duplicates a built-in tool name", () => {
  assert.throws(
    () => createReservationChatTools({
      repository,
      listServices: () => services,
      resolveServiceByName: () => null,
      customTools: [
        {
          name: CHECK_AVAILABILITY_TOOL_NAME,
          description: "Duplicate",
          inputSchema: { type: "object", properties: {}, required: [] },
          execute: () => ({}),
        },
      ],
    }),
    /Duplicate reservation chat tool name: check_availability/,
  );
});

test("throws when a knowledge tool duplicates a built-in tool name", () => {
  assert.throws(
    () => createReservationChatTools({
      repository,
      listServices: () => services,
      resolveServiceByName: () => null,
      knowledgeTool: {
        name: PREPARE_BOOKING_TOOL_NAME,
        retrieve: ({ query }) => ({ answer: query }),
      },
    }),
    /Duplicate reservation chat tool name: prepare_booking/,
  );
});

test("throws when a knowledge tool duplicates a custom tool name", () => {
  assert.throws(
    () => createReservationChatTools({
      repository,
      listServices: () => services,
      resolveServiceByName: () => null,
      knowledgeTool: {
        name: "get_location_directions",
        retrieve: ({ query }) => ({ answer: query }),
      },
      customTools: [
        {
          name: "get_location_directions",
          description: "Return host-owned location directions.",
          inputSchema: { type: "object", properties: {}, required: [] },
          execute: () => ({ address: "Host venue address" }),
        },
      ],
    }),
    /Duplicate reservation chat tool name: get_location_directions/,
  );
});

test("throws when custom tools duplicate each other", () => {
  assert.throws(
    () => createReservationChatTools({
      repository,
      listServices: () => services,
      resolveServiceByName: () => null,
      customTools: [
        {
          name: "get_location_directions",
          description: "First",
          inputSchema: { type: "object", properties: {}, required: [] },
          execute: () => ({}),
        },
        {
          name: "get_location_directions",
          description: "Second",
          inputSchema: { type: "object", properties: {}, required: [] },
          execute: () => ({}),
        },
      ],
    }),
    /Duplicate reservation chat tool name: get_location_directions/,
  );
});
