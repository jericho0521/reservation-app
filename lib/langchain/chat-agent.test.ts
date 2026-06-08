import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import {
  CHECK_AVAILABILITY_TOOL_NAME,
  GET_SERVICES_TOOL_NAME,
  PREPARE_BOOKING_TOOL_NAME,
} from "@project-play/reservation-chat-core";
import {
  createAssignedResourcePolicy,
  createCapacityPolicy,
  type ReservationRepository,
  type ReservationService,
} from "@project-play/reservations-core";
import {
  createLangChainReservationTools,
  extractPreparedBookingAction,
  getChatDomainGuardResponse,
  getLocationDirectionsAction,
} from "./chat-agent";

const preparedBookingPayload = {
  ready_for_confirmation: true,
  service_name: "Racing Simulator",
  date: "2026-04-29",
  start_time: "14:00",
  seats: 2,
  user_name: "Mo",
  user_email: "mo@example.com",
  user_phone: "+60 12-345 6789",
};

const services: ReservationService[] = [
  {
    id: "racing-simulator",
    name: "Racing Simulator",
    description: "Assigned simulator stations.",
    total_seats: 2,
    resource_kind: "station",
    selection_mode: "assigned_resource",
    policy: createAssignedResourcePolicy(2),
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
    ],
  },
  {
    id: "ps5",
    name: "PS5",
    description: "Quantity booking.",
    total_seats: 2,
    resource_kind: "capacity_bucket",
    selection_mode: "quantity",
    policy: createCapacityPolicy(2),
    layout: { kind: "none" },
  },
];

const repository: ReservationRepository = {
  async getService(serviceId) {
    return services.find((service) => service.id === serviceId) ?? null;
  },
  async getConfirmedReservations() {
    return [];
  },
  async getMaintenanceResourceLabels() {
    return [];
  },
  async createReservation(input) {
    return input;
  },
};

function getWrappedTool(name: string) {
  const tools = createLangChainReservationTools({
    repository,
    listServices: () => services,
    resolveServiceByName: (serviceName) =>
      services.find((service) =>
        service.name.toLowerCase().includes(serviceName.toLowerCase()),
      ) ?? null,
  });
  const candidate = tools.find((tool) => tool.name === name);
  assert.ok(candidate);

  return candidate;
}

test("extractPreparedBookingAction reads LangChain tool results", () => {
  const action = extractPreparedBookingAction([
    new ToolMessage({
      content: JSON.stringify(preparedBookingPayload),
      name: "prepare_booking",
      tool_call_id: "call_1",
    }),
  ]);

  assert.deepEqual(action, {
    type: "booking_confirmation",
    data: {
      service: "Racing Simulator",
      date: "2026-04-29",
      time: "14:00",
      seats: 2,
      name: "Mo",
      email: "mo@example.com",
      phone: "+60 12-345 6789",
    },
  });
});

test("createLangChainReservationTools lets descriptor executors handle invalid availability input", async () => {
  const checkAvailabilityTool = getWrappedTool(CHECK_AVAILABILITY_TOOL_NAME);

  const result = await checkAvailabilityTool.invoke({
    service_name: "Racing",
    date: "tomorrow",
  });

  assert.deepEqual(result, { error: "Invalid availability request" });
});

test("createLangChainReservationTools wraps descriptors with permissive schemas and metadata", () => {
  const checkAvailabilityTool = getWrappedTool(CHECK_AVAILABILITY_TOOL_NAME);
  const schema = checkAvailabilityTool.schema as {
    shape: Record<string, unknown>;
    safeParse(value: unknown): { success: boolean };
  };
  const metadata = checkAvailabilityTool.metadata as
    | { descriptorInputSchema?: unknown }
    | undefined;

  assert.equal(schema.safeParse({
    service_name: "Racing",
    date: "tomorrow",
  }).success, true);
  assert.ok("service_name" in schema.shape);
  assert.ok("date" in schema.shape);
  assert.ok(metadata?.descriptorInputSchema);
});

test("createLangChainReservationTools exposes relaxed prepare_booking fields", async () => {
  const prepareBookingTool = getWrappedTool(PREPARE_BOOKING_TOOL_NAME);
  const schema = prepareBookingTool.schema as {
    shape: Record<string, unknown>;
    safeParse(value: unknown): { success: boolean };
  };

  assert.ok("service_name" in schema.shape);
  assert.ok("date" in schema.shape);
  assert.ok("start_time" in schema.shape);
  assert.ok("seats" in schema.shape);
  assert.ok("user_name" in schema.shape);
  assert.ok("user_email" in schema.shape);
  assert.ok("user_phone" in schema.shape);
  assert.equal(schema.safeParse({
    service_name: "Racing Simulator",
    date: "2026-04-29",
    start_time: "14:00",
    seats: "two",
    user_name: "Mo",
    user_email: "mo@example.com",
    user_phone: "+60 12-345 6789",
  }).success, true);

  assert.deepEqual(
    await prepareBookingTool.invoke({
      service_name: "Racing Simulator",
      date: "2026-04-29",
      start_time: "14:00",
      seats: "two",
      user_name: "Mo",
      user_email: "mo@example.com",
      user_phone: "+60 12-345 6789",
    }),
    { error: "Invalid booking confirmation request" },
  );
});

test("createLangChainReservationTools keeps resource labels in get_services summaries", async () => {
  const getServicesTool = getWrappedTool(GET_SERVICES_TOOL_NAME);

  const result = await getServicesTool.invoke({});

  assert.deepEqual(result, {
    services: [
      {
        id: "racing-simulator",
        name: "Racing Simulator",
        description: "Assigned simulator stations.",
        total_capacity: 2,
        resource_kind: "station",
        selection_mode: "assigned_resource",
        reservation_policy: createAssignedResourcePolicy(2),
        resource_labels: ["SIM 1", "SIM 2"],
      },
      {
        id: "ps5",
        name: "PS5",
        description: "Quantity booking.",
        total_capacity: 2,
        resource_kind: "capacity_bucket",
        selection_mode: "quantity",
        reservation_policy: createCapacityPolicy(2),
      },
    ],
  });
});

test("extractPreparedBookingAction falls back to AI tool calls", () => {
  const action = extractPreparedBookingAction([
    new AIMessage({
      content: "",
      tool_calls: [
        {
          id: "call_1",
          name: "prepare_booking",
          args: preparedBookingPayload,
        },
      ],
    }),
  ]);

  assert.equal(action?.type, "booking_confirmation");
  assert.equal(action?.data.email, "mo@example.com");
});

test("extractPreparedBookingAction ignores prepared bookings from previous turns", () => {
  const action = extractPreparedBookingAction([
    new HumanMessage("I want to book a racing simulator tomorrow at 2pm"),
    new ToolMessage({
      content: JSON.stringify(preparedBookingPayload),
      name: "prepare_booking",
      tool_call_id: "call_1",
    }),
    new AIMessage("Please confirm this booking."),
    new HumanMessage("Thanks, I already confirmed it."),
    new AIMessage("You're all set."),
  ]);

  assert.equal(action, null);
});

test("getChatDomainGuardResponse blocks model identity questions", () => {
  assert.equal(
    getChatDomainGuardResponse("what model are you"),
    "I can help with Project Play bookings, services, availability, pricing, policies, and venue information. What would you like to book or ask about Project Play?"
  );
});

test("getChatDomainGuardResponse allows booking and business questions", () => {
  assert.equal(getChatDomainGuardResponse("Can I book racing simulator tomorrow?"), null);
  assert.equal(getChatDomainGuardResponse("What are your prices?"), null);
});

test("getLocationDirectionsAction returns a Waze-ready location card", () => {
  const action = getLocationDirectionsAction("can you show waze directions to your location?");

  assert.equal(action?.type, "location_directions");
  assert.equal(action?.data.name, "Project Play by CW");
  assert.equal(action?.data.address, "Project Play By CW, 70, Jalan PJS 11/7, Bandar Sunway, 47500 Subang Jaya, Selangor");
  assert.deepEqual(action?.data.coordinates, { lat: 3.0660998, lng: 101.6026114 });
  assert.doesNotMatch(action?.data.wazeUrl || "", /3\.0738|101\.5183/);
  assert.match(action?.data.wazeUrl || "", /Jalan%20PJS%2011%2F7/);
  assert.match(action?.data.googleMapsUrl || "", /Jalan%20PJS%2011%2F7/);
  assert.match(action?.data.wazeUrl || "", /waze\.com\/ul/);
  assert.match(action?.data.googleMapsUrl || "", /google\.com\/maps/);
});

test("getLocationDirectionsAction ignores unrelated booking questions", () => {
  assert.equal(getLocationDirectionsAction("Can I book PS5 tomorrow?"), null);
});
