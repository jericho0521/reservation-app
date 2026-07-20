import assert from "node:assert/strict";
import test from "node:test";

import { createSmtpEmailConnectionTester, smtpTransportOptions } from "./email.js";

test("SMTP email connection tester sends a bounded message to the owner", async () => {
  let transportOptions: Record<string, unknown> | undefined;
  let message: Record<string, unknown> | undefined;
  const tester = createSmtpEmailConnectionTester({
    createTransport(options) {
      transportOptions = options;
      return {
        async sendMail(value) {
          message = value as Record<string, unknown>;
          return {};
        },
      };
    },
  });

  await tester.test({
    settings: {
      host: "smtp.resend.com",
      port: 465,
      tlsMode: "required",
      from: "bookings@example.test",
      fromName: "Reservation Business",
    },
    credential: { username: "resend", password: "secret-api-key" },
    recipient: "owner@example.test",
  });

  assert.deepEqual(transportOptions, {
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    requireTLS: false,
    ignoreTLS: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
    auth: { user: "resend", pass: "secret-api-key" },
  });
  assert.deepEqual(message, {
    from: "\"Reservation Business\" <bookings@example.test>",
    to: "owner@example.test",
    subject: "Reservation Platform email test",
    text: "Your SMTP email integration is working.",
    html: "<p>Your SMTP email integration is working.</p>",
  });
});

test("SMTP transport maps STARTTLS without credentials", () => {
  assert.deepEqual(
    smtpTransportOptions({
      host: " smtp.example.test ",
      port: 587,
      tlsMode: "starttls",
      from: "bookings@example.test",
    }, {}),
    {
      host: "smtp.example.test",
      port: 587,
      secure: false,
      requireTLS: true,
      ignoreTLS: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    },
  );
});
