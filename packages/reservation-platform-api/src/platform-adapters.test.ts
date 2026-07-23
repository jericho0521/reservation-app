import assert from "node:assert/strict";
import test from "node:test";
import {
  toLegacyBookingCreateInput,
  toLegacyBookingRescheduleInput,
  toLegacyBookingUpdatePatch,
  hasMovementPatchFields,
  toPlatformAvailabilityResponse,
  toPlatformReservation,
  toPlatformResourceLayout,
  toPlatformResourceMaintenanceResponse,
  toPlatformServicesResponse,
  toPlatformVenuesResponse,
} from "./platform-adapters.js";

test("platform catalog adapters wrap legacy arrays in contract response objects", () => {
  assert.deepEqual(toPlatformServicesResponse([{
    id: "svc_123",
    name: "Simulator",
    description: "Racing",
    selection_mode: "assigned_resource",
  }]), {
    services: [{
      service_id: "svc_123",
      venue_id: undefined,
      name: "Simulator",
      is_active: true,
      description: "Racing",
      duration_minutes: undefined,
      total_quantity: undefined,
      resource_kind: undefined,
      resource_strategy: "assigned_resource",
      reservation_policy: undefined,
      resources: undefined,
      layout: undefined,
      metadata: undefined,
    }],
  });

  assert.deepEqual(toPlatformVenuesResponse([{ id: "venue_123", name: "Main" }]), {
    venues: [{
      venue_id: "venue_123",
      tenant_id: undefined,
      name: "Main",
      timezone: undefined,
      metadata: undefined,
    }],
  });
});

test("platform availability adapter maps legacy timeSlots to SDK slots", () => {
  assert.deepEqual(toPlatformAvailabilityResponse({
    totalSeats: 2,
    resource_kind: "seat",
    selection_mode: "assigned_resource",
    reservation_policy: {
      kind: "assigned_resource",
      selection_mode: "assigned_resource",
      max_quantity: 2,
      require_resource_labels: true,
      allow_partial_capacity: false,
    },
    resources: [{
      id: "res_1",
      service_id: "svc_123",
      label: "A1",
      kind: "seat",
      is_active: true,
      capacity: 1,
    }],
    layout: {
      kind: "grid",
      columns: 2,
      rows: 1,
    },
    timeSlots: [{
      start_time: "14:00",
      end_time: "15:00",
      available_quantity: 2,
      taken_seat_labels: ["A2"],
      maintenance_seat_labels: ["A3"],
    }],
  }), {
    total_quantity: 2,
    resource_kind: "seat",
    resource_strategy: "assigned_resource",
    reservation_policy: {
      kind: "assigned_resource",
      selection_mode: "assigned_resource",
      max_quantity: 2,
      require_resource_labels: true,
      allow_partial_capacity: false,
    },
    resources: [{
      resource_id: "res_1",
      service_id: "svc_123",
      label: "A1",
      kind: "seat",
      is_active: true,
      capacity: 1,
      metadata: undefined,
    }],
    layout: {
      layout_id: "availability-layout",
      service_id: undefined,
      kind: "grid",
      resources: undefined,
      metadata: {
        columns: 2,
        rows: 1,
      },
    },
    slots: [{
      start_at: undefined,
      end_at: undefined,
      start_time: "14:00",
      end_time: "15:00",
      available_quantity: 2,
      is_available: true,
      resource_ids: undefined,
      taken_resource_labels: ["A2"],
      maintenance_resource_labels: ["A3"],
    }],
  });
});

test("platform service adapter preserves assigned-resource metadata", () => {
  assert.deepEqual(toPlatformServicesResponse([{
    id: "svc_123",
    name: "Simulator",
    total_seats: 2,
    resource_kind: "station",
    selection_mode: "assigned_resource",
    reservation_policy: {
      kind: "assigned_resource",
      selection_mode: "assigned_resource",
      max_quantity: 2,
      require_resource_labels: true,
      allow_partial_capacity: false,
    },
    resources: [{
      id: "res_1",
      service_id: "svc_123",
      label: "Station 1",
      kind: "station",
      is_active: true,
    }],
    layout: [{
      id: "layout_123",
      service_id: "svc_123",
      layout_kind: "grid",
      metadata: { columns: 2 },
    }],
  }]).services[0], {
    service_id: "svc_123",
    venue_id: undefined,
    name: "Simulator",
    is_active: true,
    description: undefined,
    duration_minutes: undefined,
    total_quantity: 2,
    resource_kind: "station",
    resource_strategy: "assigned_resource",
    reservation_policy: {
      kind: "assigned_resource",
      selection_mode: "assigned_resource",
      max_quantity: 2,
      require_resource_labels: true,
      allow_partial_capacity: false,
    },
    resources: [{
      resource_id: "res_1",
      service_id: "svc_123",
      label: "Station 1",
      kind: "station",
      is_active: true,
      capacity: undefined,
      metadata: undefined,
    }],
    layout: {
      layout_id: "layout_123",
      service_id: "svc_123",
      kind: "grid",
      resources: undefined,
      metadata: { columns: 2 },
    },
    metadata: undefined,
  });
});

test("platform reservation adapter maps legacy booking customer and resources", () => {
  assert.deepEqual(toPlatformReservation({
    id: "booking_123",
    service_id: "svc_123",
    user_name: "Ada",
    user_email: "ada@example.com",
    user_phone: "555",
    booking_date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    seats_booked: 2,
    seat_labels: ["A1", "A2"],
    status: "confirmed",
    interface_type: "chat",
    services: { name: "Simulator", venue_id: "venue_123" },
  }), {
    reservation_id: "booking_123",
    status: "confirmed",
    tenant_id: undefined,
    venue_id: "venue_123",
    service_id: "svc_123",
    date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    quantity: 2,
    reservation_items: [
      { resource_label: "A1", quantity: 1 },
      { resource_label: "A2", quantity: 1 },
    ],
    customer: {
      customer_id: undefined,
      external_customer_id: undefined,
      name: "Ada",
      email: "ada@example.com",
      phone: "555",
    },
    metadata: { service_name: "Simulator", channel_origin: "web_chat" },
    created_at: undefined,
    updated_at: undefined,
  });
});

test("platform reservation adapter prefers the persisted channel over interface fallback", () => {
  const reservation = toPlatformReservation({
    id: "booking_staff",
    service_id: "svc_123",
    seats_booked: 1,
    status: "confirmed",
    interface_type: "form",
    channel: "staff",
  });

  assert.equal(reservation.metadata?.channel_origin, "staff");
});

test("platform reservation create adapter maps SDK input to legacy booking input", () => {
  assert.deepEqual(toLegacyBookingCreateInput({
    service_id: "svc_123",
    date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    quantity: 1,
    reservation_items: [{ resource_label: "A1", quantity: 1 }],
    customer: {
      name: "Ada",
      email: "ada@example.com",
      phone: "555",
    },
  }), {
    service_id: "svc_123",
    user_name: "Ada",
    user_email: "ada@example.com",
    user_phone: "555",
    booking_date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    seats_booked: 1,
    seat_labels: ["A1"],
    reservation_items: [{ resource_label: "A1", quantity: 1 }],
    interface_type: "form",
  });
});

test("platform appointment create adapter preserves the selected practitioner", () => {
  const staffId = "33333333-3333-4333-8333-333333333333";
  const adapted = toLegacyBookingCreateInput({
    service_id: "svc_123",
    staff_id: staffId,
    date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    quantity: 1,
    customer: { name: "Ada", email: "ada@example.com" },
  });

  assert.equal(adapted.staff_id, staffId);
});

test("platform reservation create adapter preserves conversational channel origin", () => {
  const adapted = toLegacyBookingCreateInput({
    service_id: "svc_123",
    date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    quantity: 1,
    customer: { name: "Ada", email: "ada@example.com" },
    source: "web_chat",
  });

  assert.equal(adapted.interface_type, "chat");
  assert.equal(adapted.channel, "web_chat");
});

test("platform reservation create adapter bridges resource ids for legacy assigned-resource routes", () => {
  assert.deepEqual(toLegacyBookingCreateInput({
    service_id: "svc_123",
    date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    quantity: 1,
    reservation_items: [{ resource_id: "res_123", quantity: 1 }],
    customer: {
      name: "Ada",
      email: "ada@example.com",
    },
  }), {
    service_id: "svc_123",
    user_name: "Ada",
    user_email: "ada@example.com",
    user_phone: "unknown",
    booking_date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    seats_booked: 1,
    seat_labels: ["res_123"],
    reservation_items: [{ resource_label: "res_123", quantity: 1 }],
    interface_type: "form",
  });
});

test("resource layout adapter preserves typed grid resources", () => {
  assert.deepEqual(toPlatformResourceLayout({
    id: "layout_123",
    service_id: "svc_123",
    layout_kind: "grid",
    metadata: {
      resources: [{ resource_id: "res_123", label: "A1", row: 1, column: 1 }],
    },
  }, "layout_123"), {
    layout_id: "layout_123",
    service_id: "svc_123",
    kind: "grid",
    resources: [{
      resource_id: "res_123",
      label: "A1",
      row: 1,
      column: 1,
      x: undefined,
      y: undefined,
      width: undefined,
      height: undefined,
      metadata: undefined,
    }],
    metadata: undefined,
  });
});

test("platform adapters sanitize metadata and enum-like fields", () => {
  const layout = toPlatformResourceLayout({
    id: "layout_123",
    layout_kind: "surprise",
    metadata: {
      public_flag: true,
      resources: [{ resource_id: "res_123" }],
    },
  }, "layout_123");

  assert.equal(layout.kind, "custom");
  assert.deepEqual(layout.metadata, { public_flag: true });
});

test("platform reservation lifecycle adapters separate update and reschedule fields", () => {
  assert.deepEqual(toLegacyBookingUpdatePatch({
    customer: { name: "Ada", email: "ada@example.com" },
    status: "confirmed",
    metadata: { ignored_by_legacy: true },
  }), {
    user_name: "Ada",
    user_email: "ada@example.com",
    status: "confirmed",
  });

  assert.deepEqual(toLegacyBookingRescheduleInput({
    date: "2026-01-03",
    start_time: "14:00",
    end_time: "15:00",
    quantity: 1,
    resource_ids: ["res_456"],
  }), {
    booking_date: "2026-01-03",
    start_time: "14:00",
    end_time: "15:00",
    seats_booked: 1,
    seat_labels: ["res_456"],
  });

  assert.equal(hasMovementPatchFields({ customer: { name: "Ada" } }), false);
  assert.equal(hasMovementPatchFields({ start_time: "14:00" }), true);
});

test("resource maintenance adapter maps legacy seat rows to maintenance contracts", () => {
  assert.deepEqual(toPlatformResourceMaintenanceResponse([{
    id: "maint_123",
    service_id: "svc_123",
    seat_label: "A1",
    reason: "Repair",
  }]), {
    maintenance: [{
      maintenance_id: "maint_123",
      resource_id: undefined,
      service_id: "svc_123",
      starts_at: undefined,
      ends_at: undefined,
      reason: "Repair",
      metadata: { resource_label: "A1" },
    }],
  });
});
