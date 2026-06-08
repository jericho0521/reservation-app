import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptBookingRows,
  adaptServiceMetadata,
  getAvailabilityMetadata,
} from "@project-play/reservations-supabase";
import {
  validateReservationRequest,
} from "@project-play/reservations-core";

test("reservation API adapter preserves legacy service fields and adds generic metadata", () => {
  const service = adaptServiceMetadata(
    {
      id: "service-1",
      name: "Racing Simulator",
      description: "Racing seats",
      total_seats: 2,
      created_at: "2026-01-01T00:00:00.000Z",
      resource_kind: "seat",
      selection_mode: "assigned_resource",
      reservation_policy: {
        max_quantity: 2,
        require_resource_labels: true,
      },
    },
    [
      {
        id: "resource-1",
        service_id: "service-1",
        label: "RS1",
        kind: "seat",
        is_active: true,
        capacity: 1,
      },
      {
        id: "resource-2",
        service_id: "service-1",
        label: "RS2",
        kind: "seat",
        is_active: true,
        capacity: 1,
      },
    ],
    {
      layout_kind: "grid",
      metadata: {
        columns: 2,
        rows: 1,
      },
    },
  );

  assert.equal(service.total_seats, 2);
  assert.equal(service.selection_mode, "assigned_resource");
  assert.equal(service.policy.kind, "assigned_resource");
  assert.equal(service.resources?.length, 2);

  assert.deepEqual(getAvailabilityMetadata(service), {
    resource_kind: "seat",
    selection_mode: "assigned_resource",
    reservation_policy: service.policy,
    resources: service.resources,
    layout: {
      kind: "grid",
      columns: 2,
      rows: 1,
      group_label: undefined,
    },
  });
});

test("reservation API adapter lets validation preserve legacy conflict mapping", () => {
  const service = adaptServiceMetadata(
    {
      id: "service-1",
      name: "Movie Hall",
      total_seats: 2,
      created_at: "2026-01-01T00:00:00.000Z",
      resource_kind: "seat",
      selection_mode: "assigned_resource",
      reservation_policy: {
        max_quantity: 2,
        require_resource_labels: true,
      },
    },
    [
      {
        id: "resource-1",
        service_id: "service-1",
        label: "A1",
        kind: "seat",
        is_active: true,
      },
    ],
  );

  const existingReservations = adaptBookingRows([
    {
      id: "booking-1",
      service_id: "service-1",
      user_name: "Ada",
      user_email: "ada@example.com",
      user_phone: "123",
      booking_date: "2026-06-08",
      start_time: "14:00",
      end_time: "15:00",
      seats_booked: 1,
      seat_labels: ["A1"],
      status: "confirmed",
      interface_type: "form",
    },
  ]);
  const requestedReservation = adaptBookingRows([
    {
      service_id: "service-1",
      user_name: "Grace",
      user_email: "grace@example.com",
      user_phone: "456",
      booking_date: "2026-06-08",
      start_time: "14:00",
      end_time: "15:00",
      seats_booked: 1,
      seat_labels: ["A1"],
      interface_type: "form",
    },
  ])[0];

  assert.deepEqual(
    validateReservationRequest(service, existingReservations, requestedReservation),
    {
      ok: false,
      error: "resource_conflict",
      conflicting_resource_labels: ["A1"],
    },
  );
});
