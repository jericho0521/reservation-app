import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptBookingRows,
  adaptMaintenanceRows,
  adaptServiceMetadata,
  createSupabaseReservationRepository,
  getAvailabilityMetadata,
  getLegacyFallbackLabels,
  RESERVATION_SUPABASE_TABLES,
  SupabaseAtomicReservationError,
  type SupabaseAtomicReservationErrorCode,
} from "./index";

function createQueryResult<T>(data: T) {
  const result = Promise.resolve({ data, error: null });

  return {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    insert() {
      return this;
    },
    single() {
      return result;
    },
    maybeSingle() {
      return result;
    },
    then(resolve: (value: { data: T; error: null }) => unknown) {
      return result.then(resolve);
    },
  };
}

test("adapts Supabase service metadata into core reservation service", () => {
  const service = adaptServiceMetadata(
    {
      id: "service-1",
      name: "Racing Simulator",
      total_seats: 2,
      created_at: "2026-01-01T00:00:00.000Z",
      resource_kind: "seat",
      selection_mode: "assigned_resource",
      reservation_policy: {
        max_quantity: 2,
        require_resource_labels: true,
      },
    },
    [
      {
        id: "resource-1",
        service_id: "service-1",
        label: "RS1",
        resource_kind: "seat",
        capacity: 1,
        status: "available",
      },
      {
        id: "resource-2",
        service_id: "service-1",
        label: "RS2",
        resource_kind: "seat",
        capacity: 1,
        status: "inactive",
      },
    ],
    {
      layout_kind: "custom",
      metadata: {
        positions: [{ resource_id: "resource-1", x: 10, y: 20 }],
      },
    },
    [
      {
        day_of_week: 1,
        start_time: "12:00",
        end_time: "00:00",
        interval_minutes: 60,
      },
    ],
  );

  assert.equal(service.selection_mode, "assigned_resource");
  assert.equal(service.policy.kind, "assigned_resource");
  assert.deepEqual(service.resources?.map((resource) => resource.label), [
    "RS1",
    "RS2",
  ]);
  assert.equal(service.resources?.[1]?.is_active, false);
  assert.equal(service.layout.kind, "custom");
  assert.deepEqual(service.availability_windows, [
    {
      day_of_week: 1,
      start_time: "12:00",
      end_time: "00:00",
      interval_minutes: 60,
    },
  ]);
  assert.deepEqual(getAvailabilityMetadata(service).resources, service.resources);
  assert.deepEqual(getLegacyFallbackLabels(service), ["RS2", "RS1"]);
});

test("adapts booking and maintenance rows into core compatibility shapes", () => {
  const reservations = adaptBookingRows([
    {
      id: "booking-1",
      service_id: "service-1",
      user_name: "Ada",
      user_email: "ada@example.com",
      user_phone: "555",
      booking_date: "2026-01-02",
      start_time: "12:00",
      end_time: "13:00",
      seats_booked: 1,
      seat_labels: ["RS1"],
      status: "confirmed",
      interface_type: "form",
    },
  ]);

  assert.equal(reservations[0]?.customer_name, "Ada");
  assert.deepEqual(reservations[0]?.items, [
    { resource_label: "RS1", quantity: 1 },
  ]);
  assert.deepEqual(adaptMaintenanceRows([{ seat_label: "RS2" }]), ["RS2"]);
});

test("repository loads service graph and validates before non-atomic insert", async () => {
  const calls: Array<{ table: string; rows?: unknown[] }> = [];
  const rowsByTable = {
    [RESERVATION_SUPABASE_TABLES.services]: {
      id: "service-1",
      name: "Racing Simulator",
      total_seats: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      resource_kind: "seat",
      selection_mode: "assigned_resource",
      reservation_policy: { max_quantity: 1, require_resource_labels: true },
    },
    [RESERVATION_SUPABASE_TABLES.reservableResources]: [
      {
        id: "resource-1",
        service_id: "service-1",
        label: "RS1",
        resource_kind: "seat",
        capacity: 1,
      },
    ],
    [RESERVATION_SUPABASE_TABLES.resourceLayouts]: null,
    [RESERVATION_SUPABASE_TABLES.serviceAvailabilityRules]: [],
    [RESERVATION_SUPABASE_TABLES.bookings]: [
      {
        id: "booking-created",
        service_id: "service-1",
        user_name: "Grace",
        user_email: "grace@example.com",
        user_phone: "555",
        booking_date: "2026-01-02",
        start_time: "12:00",
        end_time: "13:00",
        seats_booked: 1,
        seat_labels: ["RS1"],
        status: "confirmed",
        interface_type: "form",
      },
    ],
    [RESERVATION_SUPABASE_TABLES.serviceSeatMaintenance]: [],
    [RESERVATION_SUPABASE_TABLES.reservationItems]: null,
  };
  const client = {
    from(table: keyof typeof rowsByTable) {
      calls.push({ table });
      const builder = createQueryResult(rowsByTable[table]);

      return {
        ...builder,
        insert(rows: unknown[]) {
          calls[calls.length - 1] = { table, rows };
          return table === RESERVATION_SUPABASE_TABLES.bookings
            ? createQueryResult(rowsByTable[table][0])
            : createQueryResult(null);
        },
      };
    },
  };
  const repository = createSupabaseReservationRepository(client);
  const service = await repository.getService("service-1");

  assert.equal(service?.resources?.[0]?.label, "RS1");

  const result = await repository.createReservationWithValidation({
    service: service!,
    existingReservations: [],
    maintenanceResourceLabels: [],
    reservation: {
      service_id: "service-1",
      customer_name: "Grace",
      customer_email: "grace@example.com",
      customer_phone: "555",
      booking_date: "2026-01-02",
      start_time: "12:00",
      end_time: "13:00",
      quantity: 1,
      items: [{ resource_label: "RS1", quantity: 1 }],
      interface_type: "form",
      seats_booked: 1,
      seat_labels: ["RS1"],
    },
  });

  assert.equal(result.atomic, false);
  assert.equal(result.validation.ok, true);
  assert.equal(result.reservation.id, "booking-created");
  assert.ok(calls.some((call) => call.table === RESERVATION_SUPABASE_TABLES.reservationItems));
});

test("repository maps atomic RPC payload and successful booking response", async () => {
  const rpcCalls: Array<{ fn: string; params?: Record<string, unknown> }> = [];
  const client = {
    from() {
      throw new Error("from() should not be called for atomic creation");
    },
    async rpc(fn: string, params?: Record<string, unknown>) {
      rpcCalls.push({ fn, params });

      return {
        data: {
          ok: true,
          atomic: true,
          booking: {
            id: "booking-atomic",
            service_id: "service-1",
            user_name: "Grace",
            user_email: "grace@example.com",
            user_phone: "555",
            booking_date: "2026-01-02",
            start_time: "12:00:00",
            end_time: "13:00:00",
            seats_booked: 2,
            seat_labels: ["Room A"],
            status: "confirmed",
            interface_type: "form",
          },
          validation: { ok: true },
        },
        error: null,
      };
    },
  };
  const repository = createSupabaseReservationRepository(client);
  const result = await repository.createReservationAtomic({
    reservation: {
      service_id: "service-1",
      customer_name: "Grace",
      customer_email: "grace@example.com",
      customer_phone: "555",
      booking_date: "2026-01-02",
      start_time: "12:00",
      end_time: "13:00",
      quantity: 2,
      items: [{ resource_label: "Room A", quantity: 2 }],
      interface_type: "form",
      seats_booked: 2,
      seat_labels: ["Room A"],
    },
  });

  assert.equal(rpcCalls[0]?.fn, "create_reservation_atomic");
  assert.deepEqual(rpcCalls[0]?.params, {
    payload: {
      service_id: "service-1",
      user_name: "Grace",
      user_email: "grace@example.com",
      user_phone: "555",
      booking_date: "2026-01-02",
      start_time: "12:00",
      end_time: "13:00",
      seats_booked: 2,
      seat_labels: ["Room A"],
      reservation_items: [
        {
          resource_id: null,
          resource_label: "Room A",
          quantity: 2,
        },
      ],
      status: "confirmed",
      interface_type: "form",
    },
  });
  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.atomic, true);
    assert.equal(result.booking.id, "booking-atomic");
    assert.equal(result.reservation.id, "booking-atomic");
    assert.equal(result.reservation.quantity, 2);
    assert.equal(result.validation.ok, true);
  }
});

const atomicErrorCodes = [
  "invalid_service",
  "invalid_reservation",
  "invalid_resource_labels",
  "missing_resource_labels",
  "maintenance_conflict",
  "resource_conflict",
  "not_enough_capacity",
] as const satisfies readonly SupabaseAtomicReservationErrorCode[];

for (const errorCode of atomicErrorCodes) {
  test(`repository maps atomic RPC ${errorCode} responses`, async () => {
    const client = {
      from() {
        throw new Error("from() should not be called for atomic creation");
      },
      async rpc() {
        return {
          data: {
            ok: false,
            error_code: errorCode,
            message: `RPC returned ${errorCode}`,
            available_quantity: 0,
            conflicting_resource_labels: ["RS1"],
          },
          error: null,
        };
      },
    };
    const repository = createSupabaseReservationRepository(client);
    const reservation = {
      service_id: "service-1",
      customer_name: "Grace",
      customer_email: "grace@example.com",
      customer_phone: "555",
      booking_date: "2026-01-02",
      start_time: "12:00",
      end_time: "13:00",
      quantity: 1,
      items: [{ resource_label: "RS1", quantity: 1 }],
      interface_type: "form" as const,
      seats_booked: 1,
      seat_labels: ["RS1"],
    };
    const result = await repository.createReservationAtomic({ reservation });

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.atomic, true);
      assert.equal(result.error, errorCode);
      assert.equal(result.message, `RPC returned ${errorCode}`);
      assert.deepEqual(result.validation.conflicting_resource_labels, ["RS1"]);
      assert.equal(result.validation.available_quantity, 0);
    }

    await assert.rejects(
      () => repository.createReservationAtomically({ reservation }),
      (error) => {
        assert.ok(error instanceof SupabaseAtomicReservationError);
        assert.equal(error.code, errorCode);
        return true;
      },
    );
  });
}
