import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueAccountLinkNotification,
  enqueueAppointmentNotifications,
  enqueueAppointmentNotificationsSafely,
  type NotificationJobQueue,
} from "./notifications.js";

function queue(calls: unknown[]): NotificationJobQueue {
  return { async enqueue(input) { calls.push(input); return { jobId: `job-${calls.length}` }; } };
}

test("confirmed appointment enqueues confirmation and one reminder", async () => {
  const calls: any[] = [];
  await enqueueAppointmentNotifications({
    appointment: {
      reservation_id: "reservation-1",
      service_id: "service-1",
      status: "confirmed",
      quantity: 1,
      start_at: "2026-08-02T10:00:00.000Z",
      customer: { email: " ALEX@example.com " },
    },
    tenantId: "tenant-1",
    jobs: queue(calls),
    reminderMinutes: 1440,
  });
  assert.deepEqual(calls.map((call) => call.payload.kind), ["appointment_confirmed", "appointment_reminder"]);
  assert.equal(calls[0].idempotencyKey, "booking:reservation-1:confirmed");
  assert.equal(calls[1].availableAt, "2026-08-01T10:00:00.000Z");
  assert.equal(calls[1].idempotencyKey, "booking:reservation-1:reminder:2026-08-02T10:00:00.000Z");
  assert.equal(calls[0].payload.recipient, "alex@example.com");
});

test("rescheduling creates a new reminder occurrence so the old reminder can be superseded", async () => {
  const calls: any[] = [];
  const appointment = {
    reservation_id: "reservation-1", service_id: "service-1", status: "confirmed" as const, quantity: 1,
    start_at: "2026-08-03T11:00:00.000Z", customer: { email: "alex@example.com" },
  };
  await enqueueAppointmentNotifications({
    appointment, tenantId: "tenant-1", jobs: queue(calls), reminderMinutes: 60, event: "rescheduled",
  });
  assert.deepEqual(calls.map((call) => call.payload.kind), ["appointment_rescheduled", "appointment_reminder"]);
  assert.equal(calls[1].payload.expectedAppointmentStart, appointment.start_at);
  assert.equal(calls[1].idempotencyKey, `booking:reservation-1:reminder:${appointment.start_at}`);
});

test("notification queue failure never rolls back a committed appointment response", async () => {
  await assert.doesNotReject(() => enqueueAppointmentNotificationsSafely({
    appointment: {
      reservation_id: "reservation-1", service_id: "service-1", status: "confirmed", quantity: 1,
      start_at: "2026-08-02T10:00:00.000Z", customer: { email: "alex@example.com" },
    },
    tenantId: "tenant-1",
    jobs: { async enqueue() { throw new Error("queue unavailable"); } },
    reminderMinutes: 60,
  }));
});

test("cancellation emits no future reminder and account links contain only references", async () => {
  const calls: any[] = [];
  const jobs = queue(calls);
  await enqueueAppointmentNotifications({
    appointment: {
      reservation_id: "reservation-1", service_id: "service-1", status: "cancelled", quantity: 1,
      start_at: "2026-08-02T10:00:00.000Z", customer: { email: "alex@example.com" },
    },
    tenantId: "tenant-1",
    jobs,
    reminderMinutes: 1440,
    event: "cancelled",
  });
  await enqueueAccountLinkNotification({
    tenantId: "tenant-1", jobs, kind: "password_reset", recipient: "alex@example.com", referenceId: "token-record-1",
  });
  assert.deepEqual(calls.map((call) => call.payload.kind), ["appointment_cancelled", "password_reset"]);
  assert.doesNotMatch(JSON.stringify(calls), /opaque-reset-token/u);
});

test("appointments without an email stay committed without notification work", async () => {
  const calls: unknown[] = [];
  await enqueueAppointmentNotifications({
    appointment: { reservation_id: "reservation-1", service_id: "service-1", status: "confirmed", quantity: 1 },
    tenantId: "tenant-1",
    jobs: queue(calls),
    reminderMinutes: 1440,
  });
  assert.deepEqual(calls, []);
});
