import assert from "node:assert/strict";
import test from "node:test";
import {
  renderBookingConfirmationEmail,
  sendBookingConfirmationEmail,
  type BookingConfirmationDetails,
  type BookingEmailMessage,
  type BookingEmailTransport,
} from "./booking-confirmation-email";

const booking: BookingConfirmationDetails = {
  bookingId: "d75c16b3-76eb-4d32-852d-d952758aa31f",
  interfaceType: "form",
  customerName: "Alex <Racer>",
  customerEmail: "alex@example.com",
  customerPhone: "+60 12-345 6789",
  serviceName: "Racing & Simulator",
  bookingDate: "2026-08-10",
  startTime: "14:00",
  endTime: "15:00",
  seatsBooked: 2,
  seatLabels: ["RS1", "RS2"],
};

test("renderBookingConfirmationEmail includes booking details and escapes HTML", () => {
  const email = renderBookingConfirmationEmail(booking);

  assert.match(email.subject, /Racing & Simulator/);
  assert.match(email.html, /Alex &lt;Racer&gt;/);
  assert.match(email.html, /Racing &amp; Simulator/);
  assert.doesNotMatch(email.html, /Alex <Racer>/);
  assert.match(email.html, /RS1, RS2/);
  assert.match(email.html, new RegExp(booking.bookingId));
  assert.match(email.text, /Seats: 2 \(RS1, RS2\)/);
});

test("sendBookingConfirmationEmail sends the expected message once", async () => {
  const calls: Array<{
    message: BookingEmailMessage;
    options: { idempotencyKey: string };
  }> = [];
  const transport: BookingEmailTransport = {
    async send(message, options) {
      calls.push({ message, options });
      return { data: { id: "email-123" }, error: null };
    },
  };

  const result = await sendBookingConfirmationEmail(booking, {
    env: {
      BOOKING_EMAIL_FROM: "Project Play by CW <bookings@jerichofoong.com>",
    },
    transport,
  });

  assert.deepEqual(result, { sent: true, emailId: "email-123" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].message.from, "Project Play by CW <bookings@jerichofoong.com>");
  assert.deepEqual(calls[0].message.to, ["alex@example.com"]);
  assert.equal(calls[0].options.idempotencyKey, `booking-confirmation/${booking.bookingId}`);
});

test("sendBookingConfirmationEmail fails safely when configuration is missing", async () => {
  const errors: unknown[] = [];
  const result = await sendBookingConfirmationEmail(booking, {
    env: {},
    logger: { error: (...args: unknown[]) => errors.push(args) },
  });

  assert.equal(result.sent, false);
  assert.equal(result.error, "Missing BOOKING_EMAIL_FROM");
  assert.equal(errors.length, 1);
});

test("sendBookingConfirmationEmail converts provider errors into a safe result", async () => {
  const transport: BookingEmailTransport = {
    async send() {
      return { data: null, error: { message: "Provider unavailable" } };
    },
  };

  const result = await sendBookingConfirmationEmail(booking, {
    env: {
      BOOKING_EMAIL_FROM: "Project Play by CW <bookings@jerichofoong.com>",
    },
    transport,
    logger: { error: () => undefined },
  });

  assert.deepEqual(result, { sent: false, error: "Provider unavailable" });
});
