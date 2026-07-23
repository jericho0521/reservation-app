import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adaptLegacyBooking,
  adaptLegacyService,
  adaptLegacyTimeSlot,
} from "./types";

describe("reservation domain legacy adapters", () => {
  it("adapts capacity services without inferring assigned resources", () => {
    const service = adaptLegacyService({
      id: "svc-1",
      name: "Playstation 5",
      total_seats: 2,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    assert.equal(service.selection_mode, "quantity");
    assert.equal(service.resource_kind, "capacity_bucket");
    assert.equal(service.policy.kind, "capacity");
    assert.equal(service.total_seats, 2);
  });

  it("allows explicit assigned-resource metadata for legacy services", () => {
    const service = adaptLegacyService(
      {
        id: "svc-2",
        name: "Racing Simulator",
        total_seats: 16,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        resource_kind: "station",
        selection_mode: "assigned_resource",
        layout: { kind: "grid", columns: 4 },
      },
    );

    assert.equal(service.selection_mode, "assigned_resource");
    assert.equal(service.resource_kind, "station");
    assert.equal(service.policy.kind, "assigned_resource");
    assert.equal(service.layout.kind, "grid");
  });

  it("adapts legacy bookings while preserving compatibility fields", () => {
    const reservation = adaptLegacyBooking({
      service_id: "svc-2",
      user_name: "Ada Lovelace",
      user_email: "ada@example.com",
      booking_date: "2026-06-08",
      start_time: "12:00",
      end_time: "13:00",
      seats_booked: 2,
      seat_labels: ["RS1", "RS2"],
      interface_type: "form",
      channel: "staff",
    });

    assert.equal(reservation.customer_name, "Ada Lovelace");
    assert.equal(reservation.quantity, 2);
    assert.equal(reservation.channel, "staff");
    assert.deepEqual(reservation.seat_labels, ["RS1", "RS2"]);
    assert.deepEqual(
      reservation.items.map((item) => item.resource_label),
      ["RS1", "RS2"],
    );
  });

  it("adapts legacy time slots while preserving seat field names", () => {
    const slot = adaptLegacyTimeSlot({
      start_time: "12:00",
      end_time: "13:00",
      available_seats: 10,
      is_available: true,
      taken_seat_labels: ["RS3"],
      maintenance_seat_labels: ["RS4"],
    });

    assert.equal(slot.available_quantity, 10);
    assert.deepEqual(slot.taken_resource_labels, ["RS3"]);
    assert.deepEqual(slot.maintenance_resource_labels, ["RS4"]);
    assert.equal(slot.available_seats, 10);
    assert.deepEqual(slot.taken_seat_labels, ["RS3"]);
  });
});
