import assert from "node:assert/strict";
import test from "node:test";
import {
  getAvailableSeats,
  getBookedSeatLabels,
  getBookedSeats,
  getBookingsForSlot,
  getConflictingSeatLabels,
  isOverCapacity,
  normalizeSlotTime,
} from "./reservation-capacity";

test("getBookedSeats sums booked seat counts", () => {
  assert.equal(getBookedSeats([{ seats_booked: 2 }, { seats_booked: 3 }]), 5);
});

test("getAvailableSeats subtracts existing bookings from capacity", () => {
  assert.equal(getAvailableSeats(8, [{ seats_booked: 2 }, { seats_booked: 3 }]), 3);
});

test("isOverCapacity detects over-capacity booking requests", () => {
  assert.equal(isOverCapacity(8, [{ seats_booked: 5 }], 4), true);
  assert.equal(isOverCapacity(8, [{ seats_booked: 5 }], 3), false);
});

test("normalizeSlotTime compares HH:MM regardless of stored seconds", () => {
  assert.equal(normalizeSlotTime("14:00"), "14:00");
  assert.equal(normalizeSlotTime("14:00:00"), "14:00");
});

test("getBookingsForSlot excludes adjacent one-hour bookings", () => {
  const bookings = [
    { start_time: "13:00", seats_booked: 8 },
    { start_time: "14:00:00", seats_booked: 2 },
    { start_time: "15:00", seats_booked: 8 },
  ];

  assert.deepEqual(getBookingsForSlot(bookings, "14:00"), [
    { start_time: "14:00:00", seats_booked: 2 },
  ]);
});

test("getConflictingSeatLabels returns requested labels already booked in the slot", () => {
  const bookings = [
    { start_time: "14:00", seats_booked: 2, seat_labels: ["RS1", "RS8"] },
    { start_time: "14:00", seats_booked: 1, seat_labels: ["RS12"] },
  ];

  assert.deepEqual(Array.from(getBookedSeatLabels(bookings)), ["RS1", "RS8", "RS12"]);
  assert.deepEqual(getConflictingSeatLabels(bookings, ["RS2", "RS8", "RS12"]), [
    "RS8",
    "RS12",
  ]);
});
