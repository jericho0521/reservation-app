import assert from "node:assert/strict";
import test from "node:test";

import {
  createReservationPayload,
  submitLabelForMissing,
  validateBookingFlow,
  type BookingFlowState,
} from "./booking-flow.js";

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
  customer: { name: "Alex" },
  purpose: "Planning",
  submitting: false,
};

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
