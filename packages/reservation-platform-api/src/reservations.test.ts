import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildReservationSearchFilterExpression,
  cancelReservation,
  createReservation,
  legacyBookingCreateToReservation,
  listReservations,
  prepareReservationCancelInput,
  prepareLegacyReservationCreate,
  prepareLegacyReservationReschedule,
  prepareReservationCreateInput,
  prepareReservationRescheduleInput,
  prepareReservationUpdatePatch,
  readReservationById,
  normalizeReservationSearchTerm,
  rescheduleReservationWithLegacyPatch,
  toPlatformCancelledReservation,
  updateReservationWithLegacyPatch,
  type ReservationCreateRepositoryPort,
  type ReservationMutationRepositoryPort,
  type ReservationReadRepositoryPort,
} from "./reservations.js";

const apiPackageSrcDir = dirname(fileURLToPath(import.meta.url));

const validCreateInput = {
  tenant_id: "tenant_123",
  venue_id: "venue_123",
  service_id: "svc_123",
  date: "2026-07-01",
  start_time: "14:00",
  end_time: "15:00",
  quantity: 2,
  customer: {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+60123456789",
  },
};

function assertGenericPublicErrorMessage(body: unknown) {
  assert.equal(typeof body, "object");
  assert.ok(body !== null && "error" in body);
  const message = (body as { error: { message?: unknown } }).error.message;
  assert.equal(typeof message, "string");
  assert.doesNotMatch(message, /\bbookings?\b|\bseats?\b/i);
}

test("reservation services stay framework-neutral at the source boundary", () => {
  const source = readFileSync(join(apiPackageSrcDir, "reservations.ts"), "utf8");

  for (const forbidden of [
    "next/server",
    "NextResponse",
    "Supabase",
    "supabase",
    "@supabase",
    "@project-play/reservations-supabase",
    "@/app/",
    "app/api",
    "@reservation-platform/sdk",
    "react",
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `reservations.ts should not reference ${forbidden}`,
    );
  }
});

test("reservation update service validates ids before repository access", async () => {
  let called = false;
  const result = await updateReservationWithLegacyPatch({
    repository: {
      async updateReservation() {
        called = true;
        return { data: null };
      },
    },
    reservationId: "not-a-uuid",
    legacyPatch: { user_name: "Ada Lovelace" },
  });

  assert.equal(called, false);
  assert.equal(result.status, 400);
  assert.equal("error" in result.body ? result.body.error.message : null, "Invalid reservation update data");
  assertGenericPublicErrorMessage(result.body);
  assert.ok(Array.isArray("error" in result.body ? result.body.error.details : null));
});

test("reservation update service validates legacy patches before repository access", async () => {
  let called = false;
  const result = await updateReservationWithLegacyPatch({
    repository: {
      async updateReservation() {
        called = true;
        return { data: null };
      },
    },
    reservationId: "123e4567-e89b-42d3-a456-426614174000",
    legacyPatch: { user_email: "not-an-email" },
  });

  assert.equal(called, false);
  assert.equal(result.status, 400);
  assert.equal("error" in result.body ? result.body.error.message : null, "Invalid reservation update data");
  assertGenericPublicErrorMessage(result.body);
  assert.ok(Array.isArray("error" in result.body ? result.body.error.details : null));
});

test("reservation update service stamps updated_at, delegates to repository, and maps DTOs", async () => {
  let call: unknown;
  const repository: Pick<ReservationMutationRepositoryPort, "updateReservation"> = {
    async updateReservation(input) {
      call = input;
      return {
        data: {
          id: input.reservationId,
          service_id: "svc_123",
          status: "confirmed",
          booking_date: "2026-07-01",
          start_time: "14:00",
          end_time: "15:00",
          seats_booked: 2,
          user_name: "Ada Lovelace",
          user_email: "ada@example.com",
          updated_at: input.patch.updated_at,
        },
      };
    },
  };

  const result = await updateReservationWithLegacyPatch({
    repository,
    reservationId: "123e4567-e89b-42d3-a456-426614174000",
    legacyPatch: { user_name: "Ada Lovelace" },
    now: () => new Date("2026-06-12T01:02:03.000Z"),
  });

  assert.deepEqual(call, {
    reservationId: "123e4567-e89b-42d3-a456-426614174000",
    patch: {
      user_name: "Ada Lovelace",
      updated_at: "2026-06-12T01:02:03.000Z",
    },
  });
  assert.equal(result.status, 200);
  assert.equal("reservation_id" in result.body ? result.body.reservation_id : null, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal("updated_at" in result.body ? result.body.updated_at : null, "2026-06-12T01:02:03.000Z");
});

test("reservation update service maps repository not-found and generic failures", async () => {
  const missing = await updateReservationWithLegacyPatch({
    repository: {
      async updateReservation() {
        return { data: null, error: { code: "PGRST116" } };
      },
    },
    reservationId: "123e4567-e89b-42d3-a456-426614174000",
    legacyPatch: { user_name: "Ada Lovelace" },
  });

  assert.deepEqual(missing, {
    status: 404,
    body: {
      error: {
        code: "not_found",
        message: "Reservation not found",
        status: 404,
      },
    },
  });

  const failed = await updateReservationWithLegacyPatch({
    repository: {
      async updateReservation() {
        return { data: null, error: { message: "permission denied" } };
      },
    },
    reservationId: "123e4567-e89b-42d3-a456-426614174000",
    legacyPatch: { user_name: "Ada Lovelace" },
  });

  assert.deepEqual(failed, {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "Failed to update reservation",
        status: 500,
      },
    },
  });
});

test("reservation cancel service validates ids, stamps cancelled patch, and maps DTOs", async () => {
  const invalid = await cancelReservation({
    repository: {
      async updateReservation() {
        assert.fail("repository should not be called for invalid ids");
      },
    },
    reservationId: "not-a-uuid",
  });

  assert.equal(invalid.status, 400);
  assert.equal("error" in invalid.body ? invalid.body.error.message : null, "Invalid reservation id");
  assertGenericPublicErrorMessage(invalid.body);

  let call: unknown;
  const cancelled = await cancelReservation({
    repository: {
      async updateReservation(input) {
        call = input;
        return {
          data: {
            id: input.reservationId,
            service_id: "svc_123",
            status: "cancelled",
            booking_date: "2026-07-01",
            start_time: "14:00",
            end_time: "15:00",
            seats_booked: 2,
            updated_at: input.patch.updated_at,
          },
        };
      },
    },
    reservationId: "123e4567-e89b-42d3-a456-426614174000",
    now: () => new Date("2026-06-12T04:05:06.000Z"),
    audit: { reason: "customer request", changedBy: "owner_console" },
  });

  assert.deepEqual(call, {
    reservationId: "123e4567-e89b-42d3-a456-426614174000",
    patch: {
      status: "cancelled",
      updated_at: "2026-06-12T04:05:06.000Z",
      cancelled_at: "2026-06-12T04:05:06.000Z",
      cancellation_reason: "customer request",
      cancelled_by: "owner_console",
    },
  });
  assert.equal(cancelled.status, 200);
  assert.equal("status" in cancelled.body ? cancelled.body.status : null, "cancelled");
});

test("reservation cancel service maps repository not-found and generic failures", async () => {
  const missing = await cancelReservation({
    repository: {
      async updateReservation() {
        return { data: null, error: { code: "PGRST116" } };
      },
    },
    reservationId: "123e4567-e89b-42d3-a456-426614174000",
  });

  assert.deepEqual(missing, {
    status: 404,
    body: {
      error: {
        code: "not_found",
        message: "Reservation not found",
        status: 404,
      },
    },
  });

  const failed = await cancelReservation({
    repository: {
      async updateReservation() {
        return { data: null, error: { message: "permission denied" } };
      },
    },
    reservationId: "123e4567-e89b-42d3-a456-426614174000",
  });

  assert.deepEqual(failed, {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "Failed to cancel reservation",
        status: 500,
      },
    },
  });
});

test("reservation reschedule service reuses legacy update orchestration", async () => {
  let call: unknown;
  const result = await rescheduleReservationWithLegacyPatch({
    repository: {
      async updateReservation(input) {
        call = input;
        return {
          data: {
            id: input.reservationId,
            service_id: "svc_123",
            status: "confirmed",
            booking_date: "2026-07-02",
            start_time: "15:00",
            end_time: "16:00",
            seats_booked: 3,
          },
        };
      },
    },
    reservationId: "123e4567-e89b-42d3-a456-426614174000",
    legacyPatch: {
      booking_date: "2026-07-02",
      start_time: "15:00",
      end_time: "16:00",
      seats_booked: 3,
    },
    now: () => new Date("2026-06-12T07:08:09.000Z"),
  });

  assert.deepEqual(call, {
    reservationId: "123e4567-e89b-42d3-a456-426614174000",
    patch: {
      booking_date: "2026-07-02",
      start_time: "15:00",
      end_time: "16:00",
      seats_booked: 3,
      updated_at: "2026-06-12T07:08:09.000Z",
    },
  });
  assert.equal(result.status, 200);
  assert.equal("date" in result.body ? result.body.date : null, "2026-07-02");
  assert.equal("quantity" in result.body ? result.body.quantity : null, 3);
});

test("reservation list service normalizes search and delegates read query options to repository", async () => {
  const calls: unknown[] = [];
  const repository: Pick<ReservationReadRepositoryPort, "listReservations"> = {
    async listReservations(input) {
      calls.push(input);
      return {
        data: [{
          id: "booking_123",
          service_id: "svc_123",
          booking_date: "2026-07-01",
          start_time: "14:00",
          end_time: "15:00",
          seats_booked: 2,
          user_name: "Ada Lovelace",
          user_email: "ada@example.com",
          services: { name: "Court rental" },
        }],
      };
    },
  };

  const result = await listReservations({
    repository,
    search: `  ${"x".repeat(101)}  `,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(calls, [{
    search: "x".repeat(100),
    searchFilterExpression: `user_name.ilike."%${"x".repeat(100)}%",user_email.ilike."%${"x".repeat(100)}%",user_phone.ilike."%${"x".repeat(100)}%"`,
    limit: 100,
  }]);
  assert.deepEqual("reservations" in result.body ? result.body.reservations[0] : null, {
    reservation_id: "booking_123",
    status: "confirmed",
    tenant_id: undefined,
    venue_id: undefined,
    service_id: "svc_123",
    date: "2026-07-01",
    start_time: "14:00",
    end_time: "15:00",
    quantity: 2,
    reservation_items: undefined,
    customer: {
      customer_id: undefined,
      external_customer_id: undefined,
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: undefined,
    },
    metadata: { service_name: "Court rental" },
    created_at: undefined,
    updated_at: undefined,
  });
});

test("reservation list service asks capable repositories for summary counts", async () => {
  const calls: unknown[] = [];
  const summaryCalls: unknown[] = [];
  const repository: Pick<ReservationReadRepositoryPort, "listReservations" | "getReservationsSummary"> = {
    async listReservations(input) {
      calls.push(input);
      return { data: [] };
    },
    async getReservationsSummary(input) {
      summaryCalls.push(input);
      return {
        summary: {
          total: 12,
          confirmed_today: 5,
        },
      };
    },
  };

  const result = await listReservations({
    repository,
    search: " Ada ",
    today: "2026-06-13",
  });

  assert.equal(result.status, 200);
  assert.deepEqual(calls, [{
    search: "Ada",
    searchFilterExpression: 'user_name.ilike."%Ada%",user_email.ilike."%Ada%",user_phone.ilike."%Ada%"',
    limit: 100,
  }]);
  assert.deepEqual(summaryCalls, [{
    search: "Ada",
    searchFilterExpression: 'user_name.ilike."%Ada%",user_email.ilike."%Ada%",user_phone.ilike."%Ada%"',
    today: "2026-06-13",
  }]);
  assert.deepEqual(result.body, {
    reservations: [],
    summary: {
      total: 12,
      confirmed_today: 5,
    },
  });
});

test("reservation list service maps summary failures to platform errors", async () => {
  const result = await listReservations({
    repository: {
      async listReservations() {
        return { data: [] };
      },
      async getReservationsSummary() {
        return {
          summary: null,
          error: { message: "summary unavailable" },
        };
      },
    },
    today: "2026-06-13",
  });

  assert.deepEqual(result, {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "Failed to fetch reservation summary",
        status: 500,
      },
    },
  });
});

test("reservation list service omits search filter and limit for blank searches", async () => {
  let call: unknown;
  const result = await listReservations({
    repository: {
      async listReservations(input) {
        call = input;
        return { data: [] };
      },
    },
    search: "   ",
  });

  assert.equal(result.status, 200);
  assert.deepEqual(call, {
    search: null,
    searchFilterExpression: null,
    limit: null,
  });
  assert.deepEqual(result.body, { reservations: [] });
});

test("reservation list service maps repository failures to platform errors", async () => {
  const result = await listReservations({
    repository: {
      async listReservations() {
        return { data: null, error: { message: "boom" } };
      },
    },
  });

  assert.deepEqual(result, {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "Failed to fetch reservations",
        status: 500,
      },
    },
  });
});

test("reservation read service validates ids before repository access", async () => {
  let called = false;
  const result = await readReservationById({
    repository: {
      async readReservationById() {
        called = true;
        return { data: null };
      },
    },
    reservationId: "not-a-uuid",
  });

  assert.equal(called, false);
  assert.equal(result.status, 400);
  assert.equal("error" in result.body ? result.body.error.code : null, "validation_failed");
  assert.equal("error" in result.body ? result.body.error.message : null, "Invalid reservation id");
  assertGenericPublicErrorMessage(result.body);
  assert.ok(Array.isArray("error" in result.body ? result.body.error.details : null));
});

test("reservation read service maps repository rows and not-found errors", async () => {
  const found = await readReservationById({
    repository: {
      async readReservationById(reservationId) {
        return {
          data: {
            id: reservationId,
            service_id: "svc_123",
            status: "confirmed",
            booking_date: "2026-07-01",
            start_time: "14:00",
            end_time: "15:00",
            seats_booked: 2,
          },
        };
      },
    },
    reservationId: "123e4567-e89b-42d3-a456-426614174000",
  });

  assert.equal(found.status, 200);
  assert.equal("reservation_id" in found.body ? found.body.reservation_id : null, "123e4567-e89b-42d3-a456-426614174000");

  const missing = await readReservationById({
    repository: {
      async readReservationById() {
        return { data: null, error: { code: "PGRST116" } };
      },
    },
    reservationId: "123e4567-e89b-42d3-a456-426614174000",
  });

  assert.deepEqual(missing, {
    status: 404,
    body: {
      error: {
        code: "not_found",
        message: "Reservation not found",
        status: 404,
      },
    },
  });
});

test("normalizeReservationSearchTerm trims blank searches and caps length", () => {
  assert.equal(normalizeReservationSearchTerm("   "), null);
  assert.equal(normalizeReservationSearchTerm("  Alex  "), "Alex");
  assert.equal(normalizeReservationSearchTerm("x".repeat(101)), "x".repeat(100));
});

test("buildReservationSearchFilterExpression quotes reserved filter characters", () => {
  assert.equal(
    buildReservationSearchFilterExpression('Smith, Alex (VIP) "Racer"'),
    'user_name.ilike."%Smith, Alex (VIP) \\"Racer\\"%",user_email.ilike."%Smith, Alex (VIP) \\"Racer\\"%",user_phone.ilike."%Smith, Alex (VIP) \\"Racer\\"%"',
  );
});

test("buildReservationSearchFilterExpression escapes SQL LIKE wildcards", () => {
  assert.equal(
    buildReservationSearchFilterExpression("100%_ready\\now"),
    'user_name.ilike."%100\\\\%\\\\_ready\\\\\\\\now%",user_email.ilike."%100\\\\%\\\\_ready\\\\\\\\now%",user_phone.ilike."%100\\\\%\\\\_ready\\\\\\\\now%"',
  );
});

test("reservation create preparation validates public payloads and maps legacy create fields", () => {
  const prepared = prepareReservationCreateInput(validCreateInput);

  assert.equal(prepared.status, 200);
  if (!("input" in prepared)) {
    assert.fail("expected valid create input");
  }
  assert.deepEqual(prepared.input, validCreateInput);

  const legacy = prepareLegacyReservationCreate(prepared.input);
  assert.deepEqual(legacy, {
    status: 200,
    legacyInput: {
      service_id: "svc_123",
      user_name: "Ada Lovelace",
      user_email: "ada@example.com",
      user_phone: "+60123456789",
      booking_date: "2026-07-01",
      start_time: "14:00",
      end_time: "15:00",
      seats_booked: 2,
      seat_labels: undefined,
      reservation_items: undefined,
      interface_type: "form",
    },
  });
});

test("reservation create preparation rejects invalid schema payloads", () => {
  const prepared = prepareReservationCreateInput({
    service_id: "svc_123",
    quantity: 0,
    customer: {},
  });

  assert.equal(prepared.status, 400);
  assert.deepEqual("error" in prepared ? {
    code: prepared.error.error.code,
    message: prepared.error.error.message,
    status: prepared.error.error.status,
  } : null, {
    code: "validation_failed",
    message: "Invalid reservation data.",
    status: 400,
  });
  assert.ok("error" in prepared ? prepared.error.error.details : null);
  assert.deepEqual("error" in prepared ? Object.keys(prepared.error.error.details as object) : [], ["issues"]);
});

test("reservation create preparation serializes validation issues as JSON-safe details", () => {
  const prepared = prepareReservationCreateInput({
    ...validCreateInput,
    metadata: {
      nested: {
        value: true,
      },
    },
  });

  assert.equal(prepared.status, 400);
  if (!("error" in prepared)) {
    assert.fail("expected validation error");
  }

  const details = prepared.error.error.details as { issues?: Array<Record<string, unknown>> };
  assert.ok(Array.isArray(details.issues));
  assert.ok(details.issues.length > 0);
  assert.deepEqual(Object.keys(details.issues[0]).sort(), ["code", "message", "path"]);
  assert.doesNotThrow(() => JSON.stringify(details));
});

test("reservation create preparation rejects null and array payloads", () => {
  for (const payload of [null, []]) {
    const prepared = prepareReservationCreateInput(payload);

    assert.equal(prepared.status, 400);
    assert.deepEqual("error" in prepared ? {
      code: prepared.error.error.code,
      message: prepared.error.error.message,
      status: prepared.error.error.status,
    } : null, {
      code: "validation_failed",
      message: "Invalid reservation data.",
      status: 400,
    });
  }
});

test("reservation create service validates legacy create input before repository access", async () => {
  let called = false;
  const result = await createReservation({
    repository: {
      async createReservationAtomic() {
        called = true;
        throw new Error("repository should not be called");
      },
    },
    legacyInput: {
      service_id: "svc_123",
      user_name: "Ada Lovelace",
      user_email: "ada@example.com",
      user_phone: "+60123456789",
      booking_date: "2026-07-01",
      start_time: "14:00",
      end_time: "15:00",
      seats_booked: 2,
      interface_type: "form",
    },
  });

  assert.equal(called, false);
  assert.equal(result.status, 400);
  assert.equal("error" in result.body ? result.body.error.code : null, "validation_failed");
  assert.equal("error" in result.body ? result.body.error.message : null, "Invalid reservation data");
  assertGenericPublicErrorMessage(result.body);
  assert.ok(Array.isArray("error" in result.body ? result.body.error.details : null));
});

test("reservation create service converts legacy input, delegates atomic create, and maps platform DTOs", async () => {
  const legacyInput = {
    service_id: "00000000-0000-4000-8000-000000000010",
    user_name: "Ada Lovelace",
    user_email: "ada@example.com",
    user_phone: "555-0100",
    booking_date: "2026-01-02",
    start_time: "10:00",
    end_time: "11:00",
    seats_booked: 2,
    reservation_items: [
      {
        resource_id: "00000000-0000-4000-8000-000000000011",
        resource_label: "RS1",
        quantity: 2,
      },
    ],
    interface_type: "form" as const,
  };
  let atomicInput: unknown;
  const repository: ReservationCreateRepositoryPort = {
    async createReservationAtomic(input) {
      atomicInput = input;
      return {
        ok: true,
        atomic: true,
        booking: {
          id: "booking_123",
          ...legacyInput,
          seat_labels: ["RS1"],
          status: "confirmed",
        },
        reservation: legacyBookingCreateToReservation(legacyInput),
        validation: { ok: true },
      };
    },
  };

  const result = await createReservation({ repository, legacyInput });

  assert.deepEqual(atomicInput, {
    reservation: {
      service_id: "00000000-0000-4000-8000-000000000010",
      customer_name: "Ada Lovelace",
      customer_email: "ada@example.com",
      customer_phone: "555-0100",
      booking_date: "2026-01-02",
      start_time: "10:00",
      end_time: "11:00",
      quantity: 2,
      items: [{
        resource_id: "00000000-0000-4000-8000-000000000011",
        resource_label: "RS1",
        quantity: 2,
      }],
      status: "confirmed",
      interface_type: "form",
      seats_booked: 2,
      seat_labels: ["RS1"],
    },
  });
  assert.equal(result.status, 201);
  assert.equal("reservation_id" in result.body ? result.body.reservation_id : null, "booking_123");
  assert.equal("quantity" in result.body ? result.body.quantity : null, 2);
  assert.deepEqual("reservation_items" in result.body ? result.body.reservation_items : null, [{
    resource_id: "00000000-0000-4000-8000-000000000011",
    resource_label: "RS1",
    quantity: 2,
  }]);
});

test("reservation create service maps atomic failures to platform errors", async () => {
  const legacyInput = {
    service_id: "00000000-0000-4000-8000-000000000020",
    user_name: "Grace Hopper",
    user_email: "grace@example.com",
    user_phone: "555-0200",
    booking_date: "2026-01-02",
    start_time: "10:00",
    end_time: "11:00",
    seats_booked: 1,
    seat_labels: ["RS2"],
    interface_type: "chat" as const,
  };

  const result = await createReservation({
    repository: {
      async createReservationAtomic(input) {
        return {
          ok: false,
          atomic: true,
          reservation: input.reservation,
          error: "resource_conflict",
          validation: {
            ok: false,
            error: "resource_conflict",
            conflicting_resource_labels: ["RS2"],
          },
        };
      },
    },
    legacyInput,
  });

  assert.deepEqual(result, {
    status: 409,
    body: {
      error: {
        code: "conflict",
        message: "Some selected resources are no longer available",
        status: 409,
        details: {
          resource_labels: ["RS2"],
          seat_labels: ["RS2"],
        },
      },
    },
  });
});

test("reservation create public atomic errors use reservation/resource language and aliases", async () => {
  const legacyInput = {
    service_id: "00000000-0000-4000-8000-000000000020",
    user_name: "Grace Hopper",
    user_email: "grace@example.com",
    user_phone: "555-0200",
    booking_date: "2026-01-02",
    start_time: "10:00",
    end_time: "11:00",
    seats_booked: 1,
    seat_labels: ["RS2"],
    interface_type: "chat" as const,
  };

  const cases = [
    {
      error: "invalid_reservation" as const,
      status: 400,
      message: "Invalid reservation data",
      validation: { ok: false },
    },
    {
      error: "invalid_resource_labels" as const,
      status: 400,
      message: "Selected resource labels are not valid for this service",
      validation: { ok: false, conflicting_resource_labels: ["RS2"] },
      details: { resource_labels: ["RS2"], seat_labels: ["RS2"] },
    },
    {
      error: "missing_resource_labels" as const,
      status: 400,
      message: "Selected resource labels must match requested quantity",
      validation: { ok: false, conflicting_resource_labels: ["RS2"] },
      details: { resource_labels: ["RS2"], seat_labels: ["RS2"] },
    },
    {
      error: "not_enough_capacity" as const,
      status: 409,
      message: "Not enough resources available",
      validation: { ok: false, available_quantity: 0 },
      details: { available_quantity: 0, available_seats: 0 },
    },
    {
      error: "maintenance_conflict" as const,
      status: 409,
      message: "Some selected resources are under maintenance",
      validation: { ok: false, conflicting_resource_labels: ["RS2"] },
      details: { resource_labels: ["RS2"], seat_labels: ["RS2"] },
    },
    {
      error: "resource_conflict" as const,
      status: 409,
      message: "Some selected resources are no longer available",
      validation: { ok: false, conflicting_resource_labels: ["RS2"] },
      details: { resource_labels: ["RS2"], seat_labels: ["RS2"] },
    },
  ];

  for (const testCase of cases) {
    const result = await createReservation({
      repository: {
        async createReservationAtomic(input) {
          return {
            ok: false,
            atomic: true,
            reservation: input.reservation,
            error: testCase.error,
            validation: testCase.validation,
          };
        },
      },
      legacyInput,
    });

    assert.equal(result.status, testCase.status);
    assert.equal("error" in result.body ? result.body.error.message : null, testCase.message);
    assertGenericPublicErrorMessage(result.body);
    if (testCase.details) {
      assert.deepEqual("error" in result.body ? result.body.error.details : null, testCase.details);
    }
  }
});

test("reservation create legacy mapping preserves resource_ids and item resource labels", () => {
  const resourceIdsOnly = prepareLegacyReservationCreate({
    ...validCreateInput,
    resource_ids: ["resource_a", "resource_b"],
  });
  assert.deepEqual(resourceIdsOnly.legacyInput.seat_labels, ["resource_a", "resource_b"]);

  const itemInput = prepareLegacyReservationCreate({
    ...validCreateInput,
    resource_ids: ["ignored_when_items_exist"],
    reservation_items: [
      { resource_id: "resource_c", quantity: 1 },
      { resource_label: "VIP Bay", quantity: 2 },
      { resource_id: "00000000-0000-4000-8000-000000000001", quantity: 1 },
    ],
  });

  assert.deepEqual(itemInput.legacyInput.seat_labels, [
    "resource_c",
    "VIP Bay",
    "00000000-0000-4000-8000-000000000001",
  ]);
  assert.deepEqual(itemInput.legacyInput.reservation_items, [
    { resource_label: "resource_c", quantity: 1 },
    { resource_label: "VIP Bay", quantity: 2 },
    { resource_id: "00000000-0000-4000-8000-000000000001", quantity: 1 },
  ]);
});

test("reservation reschedule preparation validates public payloads and maps legacy update fields", () => {
  const prepared = prepareReservationRescheduleInput({
    date: "2026-07-02",
    start_time: "15:00",
    end_time: "16:00",
    quantity: 3,
  });

  assert.equal(prepared.status, 200);
  if (!("input" in prepared)) {
    assert.fail("expected valid reschedule input");
  }

  assert.deepEqual(prepareLegacyReservationReschedule(prepared.input), {
    status: 200,
    legacyInput: {
      booking_date: "2026-07-02",
      start_time: "15:00",
      end_time: "16:00",
      seats_booked: 3,
    },
  });
});

test("reservation reschedule preparation rejects invalid schema payloads with JSON-safe issue details", () => {
  const prepared = prepareReservationRescheduleInput({
    quantity: 0,
    metadata: {
      nested: {
        value: true,
      },
    },
  });

  assert.equal(prepared.status, 400);
  if (!("error" in prepared)) {
    assert.fail("expected validation error");
  }

  assert.equal(prepared.error.error.code, "validation_failed");
  assert.equal(prepared.error.error.message, "Invalid reservation reschedule data.");
  assert.equal(prepared.error.error.status, 400);

  const details = prepared.error.error.details as { issues?: Array<Record<string, unknown>> };
  assert.ok(Array.isArray(details.issues));
  assert.ok(details.issues.length > 0);
  assert.deepEqual(Object.keys(details.issues[0]).sort(), ["code", "message", "path"]);
  assert.doesNotThrow(() => JSON.stringify(details));
});

test("reservation reschedule preparation rejects null and array payloads", () => {
  for (const payload of [null, []]) {
    const prepared = prepareReservationRescheduleInput(payload);

    assert.equal(prepared.status, 400);
    assert.deepEqual("error" in prepared ? {
      code: prepared.error.error.code,
      message: prepared.error.error.message,
      status: prepared.error.error.status,
    } : null, {
      code: "validation_failed",
      message: "Invalid reservation reschedule data.",
      status: 400,
    });
  }
});

test("reservation reschedule legacy mapping preserves resource_ids and item resource labels", () => {
  const resourceIdsOnly = prepareLegacyReservationReschedule({
    resource_ids: ["resource_a", "resource_b"],
  });
  assert.deepEqual(resourceIdsOnly.legacyInput, {
    seat_labels: ["resource_a", "resource_b"],
  });

  const itemInput = prepareLegacyReservationReschedule({
    resource_ids: ["ignored_when_items_exist"],
    reservation_items: [
      { resource_id: "resource_c", quantity: 1 },
      { resource_label: "VIP Bay", quantity: 2 },
      { resource_id: "00000000-0000-4000-8000-000000000001", quantity: 1 },
    ],
  });

  assert.deepEqual(itemInput.legacyInput.seat_labels, [
    "resource_c",
    "VIP Bay",
    "00000000-0000-4000-8000-000000000001",
  ]);
  assert.equal("reservation_items" in itemInput.legacyInput, false);
});

test("reservation cancel preparation accepts empty payloads", () => {
  assert.deepEqual(prepareReservationCancelInput({}), {
    status: 200,
    input: {},
  });
});

test("reservation cancel preparation rejects invalid metadata with JSON-safe issue details", () => {
  const prepared = prepareReservationCancelInput({
    metadata: {
      nested: {
        value: true,
      },
    },
  });

  assert.equal(prepared.status, 400);
  if (!("error" in prepared)) {
    assert.fail("expected validation error");
  }

  assert.equal(prepared.error.error.code, "validation_failed");
  assert.equal(prepared.error.error.message, "Invalid reservation cancel data.");
  assert.equal(prepared.error.error.status, 400);

  const details = prepared.error.error.details as { issues?: Array<Record<string, unknown>> };
  assert.ok(Array.isArray(details.issues));
  assert.ok(details.issues.length > 0);
  assert.deepEqual(Object.keys(details.issues[0]).sort(), ["code", "message", "path"]);
  assert.doesNotThrow(() => JSON.stringify(details));
});

test("cancelled reservation mapping unwraps legacy DELETE payloads", () => {
  const mapped = toPlatformCancelledReservation({
    message: "Booking cancelled",
    data: {
      id: "booking_123",
      service_id: "svc_123",
      status: "cancelled",
      booking_date: "2026-07-01",
      start_time: "14:00",
      end_time: "15:00",
      seats_booked: 2,
      user_name: "Ada Lovelace",
      user_email: "ada@example.com",
      services: {
        name: "Court rental",
      },
    },
  });

  assert.equal(mapped.reservation_id, "booking_123");
  assert.equal(mapped.service_id, "svc_123");
  assert.equal(mapped.status, "cancelled");
  assert.equal(mapped.date, "2026-07-01");
  assert.equal(mapped.quantity, 2);
  assert.equal(mapped.customer?.name, "Ada Lovelace");
  assert.equal(mapped.metadata?.service_name, "Court rental");
});

test("reservation update preparation rejects movement fields", () => {
  assert.deepEqual(prepareReservationUpdatePatch({ start_time: "14:00" }), {
    status: 400,
    error: {
      error: {
        code: "validation_failed",
        message: "Use rescheduleReservation for date, time, quantity, or resource assignment changes.",
        status: 400,
      },
    },
  });
});

test("reservation update preparation maps safe patch fields to legacy update fields", () => {
  assert.deepEqual(prepareReservationUpdatePatch({
    customer: {
      name: "Ada",
      email: "ada@example.com",
    },
    status: "confirmed",
  }), {
    status: 200,
    legacyPatch: {
      user_name: "Ada",
      user_email: "ada@example.com",
      status: "confirmed",
    },
  });
});

test("reservation update preparation rejects unsupported public patch fields during compatibility phase", () => {
  assert.deepEqual(prepareReservationUpdatePatch({
    metadata: {
      note: "VIP",
    },
  }), {
    status: 400,
    error: {
      error: {
        code: "validation_failed",
        message: "Reservation PATCH field metadata is not supported by the current compatibility shim.",
        status: 400,
      },
    },
  });
});

test("reservation update preparation rejects unsupported customer subfields", () => {
  assert.deepEqual(prepareReservationUpdatePatch({
    customer: {
      phone: "555",
    },
  }), {
    status: 400,
    error: {
      error: {
        code: "validation_failed",
        message: "Reservation PATCH field customer.phone is not supported by the current compatibility shim.",
        status: 400,
      },
    },
  });
});

test("reservation update preparation rejects non-object payloads", () => {
  const expected = {
    status: 400,
    error: {
      error: {
        code: "validation_failed",
        message: "Reservation PATCH payload must be a JSON object.",
        status: 400,
      },
    },
  };

  assert.deepEqual(prepareReservationUpdatePatch(null), expected);
  assert.deepEqual(prepareReservationUpdatePatch([]), expected);
});

test("reservation update preparation rejects empty compatibility patches", () => {
  assert.deepEqual(prepareReservationUpdatePatch({}), {
    status: 400,
    error: {
      error: {
        code: "validation_failed",
        message: "Reservation PATCH must include customer.name, customer.email, or status in the current compatibility shim.",
        status: 400,
      },
    },
  });
});
