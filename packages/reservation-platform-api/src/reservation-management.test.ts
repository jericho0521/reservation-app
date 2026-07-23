import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelManagedReservation,
  hashReservationManagementToken,
  issueReservationManagement,
  readManagedReservation,
  rescheduleManagedReservation,
  type ReservationManagementRepository,
} from "./reservation-management.js";

const token = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";

test("management issuance persists only a deterministic SHA-256 hash", async () => {
  let issued: unknown;
  const result = await issueReservationManagement({
    repository: repository({ issue: async (input) => { issued = input; return { data: {} }; } }),
    reservation: { reservation_id: "booking_1", service_id: "service_1", status: "confirmed", quantity: 1 },
    token,
    now: new Date("2026-07-12T00:00:00.000Z"),
  });
  assert.equal(result.token, token);
  assert.deepEqual(issued, {
    bookingId: "booking_1",
    tokenHash: await hashReservationManagementToken(token),
    expiresAt: "2027-01-08T00:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(issued), new RegExp(token));
});

test("managed reads require both matching slug and token hash", async () => {
  let readInput: unknown;
  const result = await readManagedReservation({
    repository: repository({ read: async (input) => { readInput = input; return { data: { ok: true, booking: booking() } }; } }),
    publicSlug: " LUMA-STUDIO ",
    token,
  });
  assert.equal(result.status, 200);
  assert.deepEqual(readInput, { publicSlug: "luma-studio", tokenHash: await hashReservationManagementToken(token) });
});

test("a valid token cannot cross into another business slug", async () => {
  const result = await readManagedReservation({
    repository: repository({
      read: async ({ publicSlug }) => ({ data: publicSlug === "luma-studio" ? { ok: true, booking: booking() } : { ok: false, error_code: "not_found" } }),
    }),
    publicSlug: "northstar-rooms",
    token,
  });
  assert.equal(result.status, 404);
});

for (const errorCode of ["not_found", "expired", "revoked"] as const) {
  test(`${errorCode} management tokens fail with the same public response`, async () => {
    const result = await readManagedReservation({
      repository: repository({ read: async () => ({ data: { ok: false, error_code: errorCode } }) }),
      publicSlug: "luma-studio",
      token,
    });
    assert.equal(result.status, 404);
    assert.equal("error" in result.body && result.body.error.message, "Reservation management link is invalid or expired.");
  });
}

test("cancellation policy conflicts are public-safe and cancellation replay succeeds", async () => {
  const closed = await cancelManagedReservation({
    repository: repository({ cancel: async () => ({ data: { ok: false, error_code: "cancellation_closed" } }) }),
    publicSlug: "luma-studio",
    token,
  });
  assert.equal(closed.status, 409);

  const replayed = await cancelManagedReservation({
    repository: repository({ cancel: async () => ({ data: { ok: true, replayed: true, booking: booking({ status: "cancelled" }) } }) }),
    publicSlug: "luma-studio",
    token,
  });
  assert.equal(replayed.status, 200);
  assert.equal("status" in replayed.body && replayed.body.status, "cancelled");
});

test("managed reschedule hashes the token and maps cutoff and stale-slot conflicts", async () => {
  let rescheduleInput: unknown;
  const repositoryWithReschedule = repository({
    reschedule: async (input) => {
      rescheduleInput = input;
      return { data: { ok: false, error_code: "reschedule_closed" } };
    },
  });
  const closed = await rescheduleManagedReservation({
    repository: repositoryWithReschedule,
    publicSlug: " LUMA-STUDIO ",
    token,
    input: {
      date: "2026-08-02",
      start_time: "10:30",
      staff_id: "33333333-3333-4333-8333-333333333333",
    },
  });
  assert.equal(closed.status, 409);
  assert.deepEqual(rescheduleInput, {
    publicSlug: "luma-studio",
    tokenHash: await hashReservationManagementToken(token),
    date: "2026-08-02",
    startTime: "10:30",
    staffId: "33333333-3333-4333-8333-333333333333",
  });

  const stale = await rescheduleManagedReservation({
    repository: repository({ reschedule: async () => ({ data: { ok: false, error_code: "conflict" } }) }),
    publicSlug: "luma-studio",
    token,
    input: {
      date: "2026-08-03",
      start_time: "11:00",
      staff_id: "33333333-3333-4333-8333-333333333333",
    },
  });
  assert.equal(stale.status, 409);
});

test("managed reschedule validates date, time, and staff before repository access", async () => {
  let called = false;
  const result = await rescheduleManagedReservation({
    repository: repository({ reschedule: async () => { called = true; return {}; } }),
    publicSlug: "luma-studio",
    token,
    input: { date: "2026-02-30", start_time: "25:00", staff_id: "bad" },
  });
  assert.equal(result.status, 400);
  assert.equal(called, false);
});

test("managed capacity reschedule omits the practitioner at the repository boundary", async () => {
  let rescheduleInput: unknown;
  const result = await rescheduleManagedReservation({
    repository: repository({
      reschedule: async (input) => {
        rescheduleInput = input;
        return { data: { ok: true, booking: booking({ seats_booked: 2 }) } };
      },
    }),
    publicSlug: "seat-business",
    token,
    input: { date: "2026-08-02", start_time: "10:30" },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(rescheduleInput, {
    publicSlug: "seat-business",
    tokenHash: await hashReservationManagementToken(token),
    date: "2026-08-02",
    startTime: "10:30",
  });
});

test("malformed tokens are rejected before repository access", async () => {
  let called = false;
  const result = await readManagedReservation({
    repository: repository({ read: async () => { called = true; return {}; } }),
    publicSlug: "luma-studio",
    token: "short",
  });
  assert.equal(result.status, 404);
  assert.equal(called, false);
});

function repository(overrides: Partial<ReservationManagementRepository>): ReservationManagementRepository {
  return {
    issue: async () => ({ data: {} }),
    read: async () => ({ data: { ok: false, error_code: "not_found" } }),
    cancel: async () => ({ data: { ok: false, error_code: "not_found" } }),
    reschedule: async () => ({ data: { ok: false, error_code: "not_found" } }),
    ...overrides,
  };
}

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    service_id: "22222222-2222-4222-8222-222222222222",
    user_name: "Alex",
    user_email: "alex@example.com",
    booking_date: "2026-08-01",
    start_time: "10:00",
    end_time: "11:00",
    seats_booked: 1,
    status: "confirmed",
    interface_type: "form",
    ...overrides,
  };
}
