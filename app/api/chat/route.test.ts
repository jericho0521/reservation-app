import assert from "node:assert/strict";
import test from "node:test";
import { parseConfirmBookingPayload } from "./route";

test("parseConfirmBookingPayload requires a phone number", () => {
  assert.equal(parseConfirmBookingPayload({
    service: "Racing Simulator",
    date: "2026-05-30",
    time: "14:00",
    seats: 2,
    name: "Alex",
    email: "alex@example.com",
  }), null);
});

test("parseConfirmBookingPayload accepts complete confirmation details", () => {
  assert.deepEqual(parseConfirmBookingPayload({
    service: " Racing Simulator ",
    date: "2026-05-30",
    time: "14:00",
    seats: 2,
    name: " Alex ",
    email: "alex@example.com",
    phone: " +60 12-345 6789 ",
  }), {
    service: "Racing Simulator",
    date: "2026-05-30",
    time: "14:00",
    seats: 2,
    name: "Alex",
    email: "alex@example.com",
    phone: "+60 12-345 6789",
  });
});
