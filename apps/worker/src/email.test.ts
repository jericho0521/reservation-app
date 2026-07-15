import assert from "node:assert/strict";
import test from "node:test";
import { createEmailJobHandler, sendSmtpTestMessage, smtpTransportOptions, verifySmtpConnection } from "./email.js";

test("email jobs reload state, decrypt at execution, and render escaped content", async () => {
  const sent: any[] = [];
  let decrypted = false;
  const handler = createEmailJobHandler({
    async load() {
      return {
        subject: "Appointment confirmed",
        heading: "Hello <Alex>",
        lines: ["Your appointment is at 10:00 & confirmed."],
        settings: { host: "smtp.example.test", port: 465, tlsMode: "required", from: "bookings@example.test" },
        encryptedCredential: { envelope: true },
      };
    },
    decrypt() { decrypted = true; return { username: "mailer", password: "secret" }; },
    createTransport(options) {
      assert.equal(options.socketTimeout, 10_000);
      return { async sendMail(message: unknown) { sent.push(message); return { messageId: "provider-1" }; } } as never;
    },
  });
  const result = await handler({
    jobId: "job-1", tenantId: "tenant-1",
    payload: { kind: "appointment_confirmed", reservationId: "reservation-1", recipient: "alex@example.test", locale: "en" },
  });
  assert.equal(decrypted, true);
  assert.equal(result.providerMessageId, "provider-1");
  assert.match(sent[0].html, /Hello &lt;Alex&gt;/u);
  assert.doesNotMatch(JSON.stringify(sent), /secret/u);
});

test("email test sends one bounded message to the authenticated owner destination", async () => {
  const sent: any[] = [];
  const result = await sendSmtpTestMessage({
    settings: { host: "smtp.example.test", port: 587, tlsMode: "starttls", from: "bookings@example.test" },
    credential: { username: "mailer", password: "secret" },
    recipient: "owner@example.test",
    createTransport(options) {
      assert.equal(options.connectionTimeout, 10_000);
      return { async sendMail(message: unknown) { sent.push(message); return { messageId: "test-1" }; } } as never;
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "owner@example.test");
  assert.doesNotMatch(JSON.stringify(sent), /secret/u);
});

test("superseded or cancelled reminder state is skipped without opening SMTP", async () => {
  let transports = 0;
  const handler = createEmailJobHandler({
    async load() { return undefined; },
    decrypt() { return {}; },
    createTransport() { transports += 1; throw new Error("must not open transport"); },
  });
  assert.deepEqual(await handler({
    jobId: "job-old", tenantId: "tenant-1",
    payload: {
      kind: "appointment_reminder", reservationId: "reservation-1", recipient: "alex@example.test", locale: "en",
      expectedAppointmentStart: "2026-08-01T10:00:00.000Z",
    },
  }), { skipped: true });
  assert.equal(transports, 0);
});

test("SMTP connection test uses bounded timeouts and exposes no credential", async () => {
  let verified = false;
  const result = await verifySmtpConnection({
    settings: { host: "smtp.example.test", port: 587, tlsMode: "starttls", from: "bookings@example.test" },
    credential: { username: "mailer", password: "secret" },
    createTransport(options) {
      assert.deepEqual(options.auth, { user: "mailer", pass: "secret" });
      assert.equal(options.connectionTimeout, 10_000);
      return { async verify() { verified = true; return true; } } as never;
    },
  });
  assert.equal(verified, true);
  assert.deepEqual(result, { ok: true });
  assert.equal("credential" in result, false);
});

test("plain SMTP remains explicit and invalid ports fail closed", () => {
  assert.equal(smtpTransportOptions({ host: "localhost", port: 1025, tlsMode: "plain", from: "test@example.test" }, {}).ignoreTLS, true);
  assert.throws(() => smtpTransportOptions({ host: "localhost", port: 0, tlsMode: "plain", from: "test@example.test" }, {}), /invalid/u);
});
