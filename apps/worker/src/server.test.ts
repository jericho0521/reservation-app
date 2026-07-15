import assert from "node:assert/strict";
import test from "node:test";
import { buildAccountActionLink, isCurrentReminder } from "./server.js";

const job = {
  jobId: "job-1",
  tenantId: "tenant-1",
  payload: {
    kind: "appointment_reminder",
    reservationId: "reservation-1",
    recipient: "alex@example.test",
    locale: "en",
    expectedAppointmentStart: "2026-08-02T02:00:00.000Z",
    expectedAppointmentDate: "2026-08-02",
    expectedAppointmentTime: "10:00:00",
  },
};

test("current reminder sends while rescheduled and cancelled occurrences are suppressed", () => {
  assert.equal(isCurrentReminder(job, { status: "confirmed", date: "2026-08-02", start_time: "10:00:00" }), true);
  assert.equal(isCurrentReminder(job, { status: "confirmed", date: "2026-08-02", start_time: "11:00:00" }), false);
  assert.equal(isCurrentReminder(job, { status: "cancelled", date: "2026-08-02", start_time: "10:00:00" }), false);
});

test("account email links target the deployed console invitation and reset routes", () => {
  assert.equal(
    buildAccountActionLink("staff_invitation", "invite/token", "https://console.example/admin/"),
    "https://console.example/admin/invite/invite%2Ftoken",
  );
  assert.equal(
    buildAccountActionLink("password_reset", "reset-token", "https://console.example/admin"),
    "https://console.example/admin/reset-password/reset-token",
  );
});
