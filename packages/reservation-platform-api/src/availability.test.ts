import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createAssignedResourcePolicy, type Reservation, type ReservationService } from "@project-play/reservations-core";
import {
  listAvailability,
  prepareAvailabilityQuery,
  type AvailabilityRepositoryPort,
} from "./availability.js";

const apiPackageSrcDir = dirname(fileURLToPath(import.meta.url));

const service: ReservationService = {
  id: "svc_123",
  name: "Court 1",
  total_seats: 2,
  resource_kind: "seat",
  selection_mode: "assigned_resource",
  policy: createAssignedResourcePolicy(2),
  resources: [
    {
      id: "res_a",
      service_id: "svc_123",
      label: "A1",
      kind: "seat",
      is_active: true,
      capacity: 1,
    },
    {
      id: "res_b",
      service_id: "svc_123",
      label: "B1",
      kind: "seat",
      is_active: true,
      capacity: 1,
    },
  ],
  layout: {
    kind: "grid",
    columns: 2,
    rows: 1,
  },
};

const reservation: Reservation = {
  id: "booking_123",
  service_id: "svc_123",
  customer_name: "Ada Lovelace",
  customer_email: "ada@example.com",
  booking_date: "2026-07-01",
  start_time: "12:00",
  end_time: "13:00",
  quantity: 1,
  items: [{ resource_label: "A1", quantity: 1 }],
  status: "confirmed",
  interface_type: "form",
  seats_booked: 1,
  seat_labels: ["A1"],
};

test("availability service stays framework-neutral at the source boundary", () => {
  const source = readFileSync(join(apiPackageSrcDir, "availability.ts"), "utf8");

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
    "React",
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `availability.ts should not reference ${forbidden}`,
    );
  }
});

test("availability query preparation rejects missing service and date", () => {
  assert.deepEqual(prepareAvailabilityQuery(new URLSearchParams()), {
    status: 400,
    error: {
      error: {
        code: "validation_failed",
        message: "service_id and date are required.",
        status: 400,
      },
    },
  });
});

test("availability query preparation derives date from start_at when absent", () => {
  const prepared = prepareAvailabilityQuery(new URLSearchParams({
    service_id: "svc_123",
    start_at: "2026-07-01T15:30:00.000Z",
  }));

  assert.equal(prepared.status, 200);
  assert.equal("searchParams" in prepared ? prepared.searchParams.get("date") : null, "2026-07-01");
  assert.equal("searchParams" in prepared ? prepared.searchParams.get("start_at") : null, "2026-07-01T15:30:00.000Z");
});

test("availability query preparation rejects malformed derived start_at dates", () => {
  assert.deepEqual(prepareAvailabilityQuery(new URLSearchParams({
    service_id: "svc_123",
    start_at: "not-a-date",
  })), {
    status: 400,
    error: {
      error: {
        code: "validation_failed",
        message: "service_id and date are required.",
        status: 400,
      },
    },
  });
});

test("availability query preparation preserves explicit date when start_at is present", () => {
  const prepared = prepareAvailabilityQuery(new URLSearchParams({
    service_id: "svc_123",
    date: "2026-07-02",
    start_at: "2026-07-01T15:30:00.000Z",
  }));

  assert.equal(prepared.status, 200);
  assert.equal("searchParams" in prepared ? prepared.searchParams.get("date") : null, "2026-07-02");
});

test("availability query preparation does not mutate caller-provided search params", () => {
  const searchParams = new URLSearchParams({
    service_id: "svc_123",
    start_at: "2026-07-01T15:30:00.000Z",
  });

  const prepared = prepareAvailabilityQuery(searchParams);

  assert.equal(prepared.status, 200);
  assert.equal(searchParams.get("date"), null);
  assert.equal("searchParams" in prepared ? prepared.searchParams.get("date") : null, "2026-07-01");
});

test("availability list service validates before resolving repository", async () => {
  let repositoryFactoryCalled = false;

  const result = await listAvailability({
    repository() {
      repositoryFactoryCalled = true;
      throw new Error("repository should not be resolved");
    },
    query: new URLSearchParams(),
  });

  assert.equal(repositoryFactoryCalled, false);
  assert.deepEqual(result, {
    status: 400,
    body: {
      error: {
        code: "validation_failed",
        message: "service_id and date are required.",
        status: 400,
      },
    },
  });
});

test("availability list service derives date, reads repository, and maps slots with metadata", async () => {
  let repositoryCall: unknown;
  const repository: AvailabilityRepositoryPort = {
    async readAvailability(input) {
      repositoryCall = input;
      return {
        service,
        bookings: [reservation],
        maintenanceResourceLabels: ["B1"],
      };
    },
  };

  const result = await listAvailability({
    repository,
    query: new URLSearchParams({
      service_id: "svc_123",
      start_at: "2026-07-01T12:00:00.000Z",
    }),
  });

  assert.deepEqual(repositoryCall, {
    serviceId: "svc_123",
    date: "2026-07-01",
  });
  assert.equal(result.status, 200);

  const body = result.body;
  assert.ok(!("error" in body));
  assert.equal(body.total_quantity, 2);
  assert.equal(body.resource_kind, "seat");
  assert.equal(body.resource_strategy, "assigned_resource");
  assert.deepEqual(body.resources?.map((resource) => resource.label), ["A1", "B1"]);
  assert.equal(body.layout?.kind, "grid");
  assert.equal(body.slots.length, 13);
  assert.deepEqual(body.slots[0], {
    start_at: undefined,
    end_at: undefined,
    start_time: "12:00",
    end_time: "13:00",
    available_quantity: 0,
    is_available: false,
    resource_ids: undefined,
    taken_resource_labels: ["A1", "B1"],
    maintenance_resource_labels: ["B1"],
  });
});

test("availability intersects operating windows, minimum notice, horizon, and closures", async () => {
  const operatingHours = {
    timezone: "Asia/Kuala_Lumpur",
    booking_horizon_days: 30,
    slot_interval_minutes: 30,
    minimum_notice_minutes: 120,
    intervals: [{ day_of_week: 1, start_time: "09:00", end_time: "12:00" }],
    closures: [{ date: "2026-07-20" }],
  };
  const repository: AvailabilityRepositoryPort = {
    async readAvailability() {
      return {
        service,
        bookings: [],
        maintenanceResourceLabels: [],
        operatingHours,
        durationMinutes: 60,
      };
    },
  };
  const now = new Date("2026-07-13T00:00:00.000Z");

  const open = await listAvailability({
    repository,
    query: { service_id: "svc_123", date: "2026-07-13" },
    now,
  });
  const closed = await listAvailability({
    repository,
    query: { service_id: "svc_123", date: "2026-07-20" },
    now,
  });
  const beyondHorizon = await listAvailability({
    repository,
    query: { service_id: "svc_123", date: "2026-08-20" },
    now,
  });

  assert.ok(!("error" in open.body));
  assert.deepEqual(open.body.slots.map((slot) => slot.start_time), ["10:00", "10:30", "11:00"]);
  assert.ok(!("error" in closed.body));
  assert.equal(closed.body.slots.length, 0);
  assert.ok(!("error" in beyondHorizon.body));
  assert.equal(beyondHorizon.body.slots.length, 0);
});

test("availability list service maps storage not found errors", async () => {
  const missing = await listAvailability({
    repository: {
      async readAvailability() {
        throw { status: 404 };
      },
    },
    query: new URLSearchParams({
      service_id: "svc_404",
      date: "2026-07-01",
    }),
  });

  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, {
    error: {
      code: "not_found",
      message: "Service not found",
      status: 404,
    },
  });
  assert.deepEqual(missing.cause, { status: 404 });
});

test("availability list service maps generic storage errors", async () => {
  const failed = await listAvailability({
    repository: {
      async readAvailability() {
        throw new Error("permission denied");
      },
    },
    query: new URLSearchParams({
      service_id: "svc_123",
      date: "2026-07-01",
    }),
  });

  assert.equal(failed.status, 500);
  assert.deepEqual(failed.body, {
    error: {
      code: "internal_error",
      message: "Failed to check availability",
      status: 500,
    },
  });
  assert.ok(failed.cause instanceof Error);
});
