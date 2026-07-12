import assert from "node:assert/strict";
import test from "node:test";

import {
  bookingErrorMessage,
  canAdvanceBookingJourney,
  createReservationPayload,
  nextBookingJourneyStep,
  localDateInputValue,
  previousBookingJourneyStep,
  submitBookingFlowOnce,
  submitLabelForMissing,
  validateBookingFlow,
  type BookingFlowState,
} from "./booking-flow.js";
import { PlatformError } from "@reservation-platform/sdk";

const baseState: BookingFlowState = {
  serviceId: "svc_123",
  service: {
    service_id: "svc_123",
    name: "Room",
    resource_strategy: "quantity",
  },
  availability: {
    slots: [{ start_time: "09:00", end_time: "10:00", available_quantity: 4, is_available: true }],
  },
  date: "2026-06-28",
  selectedSlot: { start_time: "09:00", end_time: "10:00", available_quantity: 4, is_available: true },
  quantity: 2,
  selectedResourceIds: [],
  selectedResourceLabels: [],
  selectedResourceCapacities: [],
  customer: { name: "Alex" },
  purpose: "Planning",
  submitting: false,
};

test("booking date defaults use the customer's local calendar day instead of UTC", () => {
  assert.equal(localDateInputValue(new Date(2026, 6, 13, 0, 30)), "2026-07-13");
});

test("validateBookingFlow accepts complete quantity booking state", () => {
  const validation = validateBookingFlow(baseState);
  assert.equal(validation.isValid, true);
  assert.deepEqual(validation.missing, []);
  assert.equal(validation.submitLabel, "Confirm Reservation");
});

test("validateBookingFlow explains disabled submit states", () => {
  const validation = validateBookingFlow({
    ...baseState,
    selectedSlot: undefined,
    customer: {},
  });
  assert.equal(validation.isValid, false);
  assert.deepEqual(validation.missing, ["slot", "customer"]);
  assert.equal(validation.submitLabel, "Select a Time Slot");
  assert.equal(submitLabelForMissing(["customer"]), "Add Customer Details");
});

test("validateBookingFlow requires enough assigned resources", () => {
  const validation = validateBookingFlow({
    ...baseState,
    service: {
      service_id: "svc_123",
      name: "Seat booking",
      resource_strategy: "assigned_resource",
    },
    selectedResourceIds: ["res_1"],
    selectedResourceLabels: ["A1"],
    quantity: 2,
  });
  assert.equal(validation.isValid, false);
  assert.deepEqual(validation.missing, ["resources"]);
});

test("validateBookingFlow rejects assigned resource count mismatches", () => {
  const validation = validateBookingFlow({
    ...baseState,
    service: {
      service_id: "svc_123",
      name: "Seat booking",
      resource_strategy: "assigned_resource",
    },
    selectedResourceIds: ["res_1", "res_2"],
    selectedResourceLabels: ["A1", "A2"],
    quantity: 1,
  });
  assert.equal(validation.isValid, false);
  assert.deepEqual(validation.missing, ["resources"]);
});

test("room resources satisfy attendee quantity through configured capacity", () => {
  const roomState: BookingFlowState = {
    ...baseState,
    service: { service_id: "svc_123", name: "Meeting room", resource_strategy: "hybrid" },
    availability: { slots: [{ start_time: "09:00", end_time: "10:00", available_quantity: 10, is_available: true }] },
    selectedSlot: { start_time: "09:00", end_time: "10:00", available_quantity: 10, is_available: true },
    quantity: 6,
    selectedResourceIds: ["room_1"],
    selectedResourceLabels: ["Boardroom"],
    selectedResourceCapacities: [8],
  };
  assert.equal(validateBookingFlow(roomState).isValid, true);
  assert.deepEqual(createReservationPayload(roomState).reservation_items, [{ resource_label: "Boardroom", quantity: 6 }]);
});

test("room resources reject attendee quantities above selected capacity", () => {
  const validation = validateBookingFlow({
    ...baseState,
    service: { service_id: "svc_123", name: "Meeting room", resource_strategy: "hybrid" },
    quantity: 9,
    selectedResourceIds: ["room_1"],
    selectedResourceLabels: ["Boardroom"],
    selectedResourceCapacities: [8],
  });
  assert.deepEqual(validation.missing, ["slot", "resources"]);
});

test("validateBookingFlow rejects unavailable selected resources", () => {
  const validation = validateBookingFlow({
    ...baseState,
    service: {
      service_id: "svc_123",
      name: "Seat booking",
      resource_strategy: "assigned_resource",
    },
    availability: {
      slots: [{
        start_time: "09:00",
        end_time: "10:00",
        available_quantity: 4,
        is_available: true,
        taken_resource_labels: ["A1"],
      }],
    },
    selectedSlot: {
      start_time: "09:00",
      end_time: "10:00",
      available_quantity: 4,
      is_available: true,
      taken_resource_labels: ["A1"],
    },
    selectedResourceIds: ["res_1"],
    selectedResourceLabels: ["A1"],
    quantity: 1,
  });
  assert.equal(validation.isValid, false);
  assert.deepEqual(validation.missing, ["resources"]);
});

test("validateBookingFlow rejects selected slots missing from current availability", () => {
  const validation = validateBookingFlow({
    ...baseState,
    availability: {
      slots: [{ start_time: "10:00", end_time: "11:00", available_quantity: 4, is_available: true }],
    },
    selectedSlot: { start_time: "09:00", end_time: "10:00", available_quantity: 4, is_available: true },
  });
  assert.equal(validation.isValid, false);
  assert.deepEqual(validation.missing, ["slot"]);
});

test("validateBookingFlow checks selected resources against refreshed availability slot", () => {
  const validation = validateBookingFlow({
    ...baseState,
    service: {
      service_id: "svc_123",
      name: "Seat booking",
      resource_strategy: "assigned_resource",
    },
    availability: {
      slots: [{
        start_time: "09:00",
        end_time: "10:00",
        available_quantity: 4,
        is_available: true,
        taken_resource_labels: ["A1"],
      }],
    },
    selectedSlot: {
      start_time: "09:00",
      end_time: "10:00",
      available_quantity: 4,
      is_available: true,
    },
    selectedResourceIds: ["res_1"],
    selectedResourceLabels: ["A1"],
    quantity: 1,
  });

  assert.equal(validation.isValid, false);
  assert.deepEqual(validation.missing, ["resources"]);
});

test("createReservationPayload maps booking flow state to platform input", () => {
  const payload = createReservationPayload(baseState);
  assert.deepEqual(payload, {
    service_id: "svc_123",
    date: "2026-06-28",
    start_time: "09:00",
    end_time: "10:00",
    quantity: 2,
    customer: { name: "Alex" },
    source: "reservation-platform-react",
    metadata: { purpose: "Planning" },
  });
});

test("createReservationPayload rejects stale selected slots when availability is loaded", () => {
  assert.throws(
    () => createReservationPayload({
      ...baseState,
      availability: {
        slots: [{ start_time: "10:00", end_time: "11:00", available_quantity: 4, is_available: true }],
      },
      selectedSlot: { start_time: "09:00", end_time: "10:00", available_quantity: 4, is_available: true },
    }),
    /Selected slot is no longer available/,
  );
});

test("booking journey advances and returns only when the current step is complete", () => {
  assert.equal(canAdvanceBookingJourney("date", baseState), true);
  assert.equal(nextBookingJourneyStep("date", baseState), "slot");
  assert.equal(nextBookingJourneyStep("details", baseState), "details");
  assert.equal(nextBookingJourneyStep("details", {
    ...baseState,
    customer: { name: "Alex", email: "alex@example.com" },
  }), "review");
  assert.equal(previousBookingJourneyStep("review"), "details");
  assert.equal(previousBookingJourneyStep("date"), "date");
});

test("booking journey maps stale API validation to a recovery instruction", () => {
  assert.equal(bookingErrorMessage(new PlatformError({
    code: "conflict",
    message: "resource_conflict",
    status: 409,
  })), "That option is no longer available. Refresh availability and choose another time.");
});

test("duplicate confirmation shares one in-flight reservation mutation", async () => {
  let creates = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const client = {
    async createReservation() {
      creates += 1;
      await pending;
      return { reservation_id: "reservation_1", status: "confirmed", service_id: baseState.serviceId, quantity: 2 };
    },
    async listAvailability() {
      return baseState.availability!;
    },
  };
  const guard = {};
  const first = submitBookingFlowOnce({ client, state: baseState }, guard);
  const second = submitBookingFlowOnce({ client, state: baseState }, guard);
  assert.equal(first, second);
  assert.equal(creates, 1);
  release();
  await first;
});
