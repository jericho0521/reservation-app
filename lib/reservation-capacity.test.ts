import assert from "node:assert/strict";
import test from "node:test";
import {
  getAvailableSeats,
  getAvailableSeatsForRange,
  getAvailableSeatsWithMaintenance,
  getBookedSeatLabels,
  getBookedSeats,
  getBookingsForRange,
  getBookingsForSlot,
  getConflictingSeatLabels,
  isOverCapacity,
} from "./reservation-capacity";
import { normalizeSlotTime } from "./booking-schedule";

test("getBookedSeats sums booked seat counts", () => {
  assert.equal(getBookedSeats([{ seats_booked: 2 }, { seats_booked: 3 }]), 5);
});

test("getAvailableSeats subtracts existing bookings from capacity", () => {
  assert.equal(getAvailableSeats(8, [{ seats_booked: 2 }, { seats_booked: 3 }]), 3);
});

test("getAvailableSeatsWithMaintenance subtracts blocked seats from capacity", () => {
  assert.equal(getAvailableSeatsWithMaintenance(8, [{ seats_booked: 2 }], ["RS1", "RS2"]), 4);
});

test("getAvailableSeatsWithMaintenance does not double-count booked seats under maintenance", () => {
  assert.equal(
    getAvailableSeatsWithMaintenance(8, [
      { seats_booked: 1, seat_labels: ["RS1"] },
    ], ["RS1", "RS2"]),
    6,
  );
});

test("isOverCapacity detects over-capacity booking requests", () => {
  assert.equal(isOverCapacity(8, [{ seats_booked: 5 }], 4), true);
  assert.equal(isOverCapacity(8, [{ seats_booked: 5 }], 3), false);
});

test("normalizeSlotTime compares HH:MM regardless of stored seconds", () => {
  assert.equal(normalizeSlotTime("14:00"), "14:00");
  assert.equal(normalizeSlotTime("14:00:00"), "14:00");
});

test("getAvailableSeatsForRange reuses fallback seat identities across separate hours", () => {
  const bookings = [
    { start_time: "12:00", end_time: "13:00", seats_booked: 1 },
    { start_time: "13:00", end_time: "14:00", seats_booked: 1 },
  ];

  assert.equal(getAvailableSeatsForRange(2, bookings, "12:00", "14:00", []), 1);
});

test("getAvailableSeatsForRange requires a seat to be free for the whole range", () => {
  const bookings = [
    { start_time: "12:00", end_time: "13:00", seats_booked: 1, seat_labels: ["RS1"] },
    { start_time: "13:00", end_time: "14:00", seats_booked: 1, seat_labels: ["RS2"] },
  ];

  assert.equal(getAvailableSeatsForRange(2, bookings, "12:00", "14:00", []), 0);
});

test("getBookingsForRange includes bookings that overlap any requested hour", () => {
  const bookings = [
    { start_time: "12:00", end_time: "14:00", seats_booked: 2 },
    { start_time: "14:00", end_time: "15:00", seats_booked: 1 },
    { start_time: "16:00", end_time: "17:00", seats_booked: 1 },
  ];

  assert.deepEqual(getBookingsForRange(bookings, "13:00", "15:00"), bookings.slice(0, 2));
});

test("getBookingsForSlot includes a multi-hour booking covering that slot", () => {
  const booking = { start_time: "12:00", end_time: "14:00", seats_booked: 2 };
  assert.deepEqual(getBookingsForSlot([booking], "13:00"), [booking]);
});

test("getBookingsForSlot excludes adjacent one-hour bookings", () => {
  const bookings = [
    { start_time: "13:00", end_time: "14:00", seats_booked: 8 },
    { start_time: "14:00:00", end_time: "15:00", seats_booked: 2 },
    { start_time: "15:00", end_time: "16:00", seats_booked: 8 },
  ];

  assert.deepEqual(getBookingsForSlot(bookings, "14:00"), [
    { start_time: "14:00:00", end_time: "15:00", seats_booked: 2 },
  ]);
});

test("getConflictingSeatLabels returns requested labels already booked in the slot", () => {
  const bookings = [
    { start_time: "14:00", end_time: "15:00", seats_booked: 2, seat_labels: ["RS1", "RS8"] },
    { start_time: "14:00", end_time: "15:00", seats_booked: 1, seat_labels: ["RS12"] },
  ];

  assert.deepEqual(Array.from(getBookedSeatLabels(bookings)), ["RS1", "RS8", "RS12"]);
  assert.deepEqual(getConflictingSeatLabels(bookings, ["RS2", "RS8", "RS12"]), [
    "RS8",
    "RS12",
  ]);
});
