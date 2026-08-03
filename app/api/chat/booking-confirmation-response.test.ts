import assert from "node:assert/strict";
import test from "node:test";
import { getBookingConfirmationContent } from "./booking-confirmation-response";

const booking = {
  service: "Racing Simulator",
  date: "2026-08-10",
  time: "14:00",
  seats: 2,
  email: "alex@example.com",
};

test("getBookingConfirmationContent reports successful email delivery", () => {
  const content = getBookingConfirmationContent(booking, {
    success: true,
    email_sent: true,
  });

  assert.match(content, /booking is confirmed/);
  assert.match(content, /confirmation email has been sent to alex@example.com/);
});

test("getBookingConfirmationContent preserves confirmation when email fails", () => {
  const content = getBookingConfirmationContent(booking, {
    success: true,
    email_sent: false,
  });

  assert.match(content, /booking is confirmed/);
  assert.match(content, /couldn't send the confirmation email/);
  assert.doesNotMatch(content, /has been sent/);
});

test("getBookingConfirmationContent reports booking creation failure", () => {
  const content = getBookingConfirmationContent(booking, {
    success: false,
    error: "Only one seat is available",
  });

  assert.equal(content, "Sorry, there was an issue: Only one seat is available");
});
