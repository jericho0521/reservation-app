import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptBookingRows,
  adaptMaintenanceRows,
  adaptServiceMetadata,
  createSupabaseAvailabilityRepository,
  createSupabaseIdempotencyRepository,
  createSupabasePlatformCatalogRepository,
  createSupabaseReservationResourceLabelRepository,
  createSupabaseReservationRepository,
  createSupabaseReservationMutationRepository,
  createSupabaseReservationReadRepository,
  createSupabaseResourceMaintenanceRepository,
  createSupabaseTenantVenueRepository,
  getAvailabilityMetadata,
  getLegacyFallbackLabels,
  RESERVATION_SUPABASE_AVAILABILITY_RPCS,
  RESERVATION_SUPABASE_IDEMPOTENCY_RPCS,
  RESERVATION_SUPABASE_SELECTS,
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
    upsert() {
      return this;
    },
    update() {
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

type RecordedContextRead = {
  table: string;
  select?: string;
  filters: Array<{ column: string; value: unknown }>;
  cardinality?: "single" | "maybeSingle";
};

type SupabaseTestResult = {
  data: unknown;
  error: Record<string, unknown> | null;
  count?: number | null;
};

type RecordedCatalogRead = {
  client: string;
  table: string;
  select?: string;
  filters: Array<{ column: string; value: unknown }>;
  orders: string[];
  cardinality?: "single" | "maybeSingle";
};

type RecordedReservationCompatibilityCall = {
  table: string;
  selectCalls: Array<string | undefined | { columns?: string; options?: Record<string, unknown> }>;
  filters: Array<{ column: string; value: unknown }>;
  orFilters: string[];
  orders: Array<{ column: string; options?: Record<string, unknown> }>;
  limits: number[];
  update?: unknown;
  cardinality?: "single";
};

function createReservationCompatibilityClient(
  results: SupabaseTestResult[],
  calls: RecordedReservationCompatibilityCall[],
) {
  return {
    from(table: string) {
      const call: RecordedReservationCompatibilityCall = {
        table,
        selectCalls: [],
        filters: [],
        orFilters: [],
        orders: [],
        limits: [],
      };
      calls.push(call);
      const result = Promise.resolve(results.shift() ?? { data: null, error: null });

      return {
        select(columns?: string, options?: Record<string, unknown>) {
          call.selectCalls.push(options ? { columns, options } : columns);
          return this;
        },
        eq(column: string, value: unknown) {
          call.filters.push({ column, value });
          return this;
        },
        or(expression: string) {
          call.orFilters.push(expression);
          return this;
        },
        order(column: string, options?: Record<string, unknown>) {
          call.orders.push({ column, options });
          return this;
        },
        limit(count: number) {
          call.limits.push(count);
          return this;
        },
        insert() {
          throw new Error("insert() should not be called for reservation compatibility reads");
        },
        upsert() {
          throw new Error("upsert() should not be called for reservation compatibility reads");
        },
        update(row: unknown) {
          call.update = row;
          return this;
        },
        single() {
          call.cardinality = "single";
          return result;
        },
        maybeSingle() {
          throw new Error("maybeSingle() should not be called for reservation compatibility reads");
        },
        then(resolve: (value: SupabaseTestResult) => unknown) {
          return result.then(resolve);
        },
      };
    },
  };
}

function createCatalogReadClient(
  client: string,
  resultsByTable: Record<string, SupabaseTestResult[]>,
  calls: RecordedCatalogRead[],
) {
  return {
    from(table: string) {
      const call: RecordedCatalogRead = { client, table, filters: [], orders: [] };
      calls.push(call);
      const result = Promise.resolve(
        resultsByTable[table]?.shift() ?? { data: null, error: null },
      );

      return {
        select(columns?: string) {
          call.select = columns;
          return this;
        },
        eq(column: string, value: unknown) {
          call.filters.push({ column, value });
          return this;
        },
        order(column: string) {
          call.orders.push(column);
          return this;
        },
        insert() {
          throw new Error("insert() should not be called for catalog reads");
        },
        upsert() {
          throw new Error("upsert() should not be called for catalog reads");
        },
        update() {
          throw new Error("update() should not be called for catalog reads");
        },
        single() {
          call.cardinality = "single";
          return result;
        },
        maybeSingle() {
          call.cardinality = "maybeSingle";
          return result;
        },
        then(resolve: (value: SupabaseTestResult) => unknown) {
          return result.then(resolve);
        },
      };
    },
  };
}

function createContextReadClient(
  resultsByTable: Record<string, SupabaseTestResult>,
  calls: RecordedContextRead[],
) {
  return {
    from(table: string) {
      const call: RecordedContextRead = { table, filters: [] };
      calls.push(call);
      const result = Promise.resolve(resultsByTable[table] ?? { data: null, error: null });

      return {
        select(columns?: string) {
          call.select = columns;
          return this;
        },
        eq(column: string, value: unknown) {
          call.filters.push({ column, value });
          return this;
        },
        insert() {
          throw new Error("insert() should not be called for context reads");
        },
        upsert() {
          throw new Error("upsert() should not be called for context reads");
        },
        update() {
          throw new Error("update() should not be called for context reads");
        },
        single() {
          call.cardinality = "single";
          return result;
        },
        maybeSingle() {
          call.cardinality = "maybeSingle";
          return result;
        },
        then(resolve: (value: SupabaseTestResult) => unknown) {
          return result.then(resolve);
        },
      };
    },
  };
}

test("catalog repository uses public and admin Supabase clients for query shapes", async () => {
  const calls: RecordedCatalogRead[] = [];
  const publicClient = createCatalogReadClient(
    "public",
    {
      [RESERVATION_SUPABASE_TABLES.venues]: [
        { data: [{ id: "venue-1" }], error: null },
        { data: { id: "venue-1" }, error: null },
      ],
    },
    calls,
  );
  const adminClient = createCatalogReadClient(
    "admin",
    {
      [RESERVATION_SUPABASE_TABLES.reservableResources]: [
        { data: [{ id: "resource-1" }], error: null },
      ],
      [RESERVATION_SUPABASE_TABLES.resourceLayouts]: [
        { data: { id: "layout-1" }, error: null },
      ],
    },
    calls,
  );
  const repository = createSupabasePlatformCatalogRepository({ publicClient, adminClient });

  await repository.listVenues();
  await repository.getVenue("venue-1");
  await repository.listResources();
  await repository.getResourceLayout("layout-1");

  assert.deepEqual(calls, [
    {
      client: "public",
      table: RESERVATION_SUPABASE_TABLES.venues,
      select: RESERVATION_SUPABASE_SELECTS.catalogVenue,
      filters: [],
      orders: ["name"],
    },
    {
      client: "public",
      table: RESERVATION_SUPABASE_TABLES.venues,
      select: RESERVATION_SUPABASE_SELECTS.catalogVenueWithEquipment,
      filters: [{ column: "id", value: "venue-1" }],
      orders: [],
      cardinality: "single",
    },
    {
      client: "admin",
      table: RESERVATION_SUPABASE_TABLES.reservableResources,
      select: RESERVATION_SUPABASE_SELECTS.catalogResource,
      filters: [],
      orders: ["label"],
    },
    {
      client: "admin",
      table: RESERVATION_SUPABASE_TABLES.resourceLayouts,
      select: RESERVATION_SUPABASE_SELECTS.catalogResourceLayout,
      filters: [{ column: "id", value: "layout-1" }],
      orders: [],
      cardinality: "maybeSingle",
    },
  ]);
});

test("catalog repository does not create admin client for public catalog reads", async () => {
  const calls: RecordedCatalogRead[] = [];
  const publicClient = createCatalogReadClient(
    "public",
    {
      [RESERVATION_SUPABASE_TABLES.venues]: [
        { data: [{ id: "venue-1" }], error: null },
      ],
      [RESERVATION_SUPABASE_TABLES.services]: [
        { data: [{ id: "service-1" }], error: null },
      ],
    },
    calls,
  );
  let adminClientCreated = false;
  const repository = createSupabasePlatformCatalogRepository({
    publicClient,
    adminClient() {
      adminClientCreated = true;
      throw new Error("admin client should be lazy for public catalog reads");
    },
  });

  await repository.listVenues();
  await repository.listServices();

  assert.equal(adminClientCreated, false);
  assert.deepEqual(calls.map((call) => call.client), ["public", "public"]);
});

test("catalog repository preserves strict service query errors without fallback reads", async () => {
  const calls: RecordedCatalogRead[] = [];
  const publicClient = createCatalogReadClient(
    "public",
    {
      [RESERVATION_SUPABASE_TABLES.services]: [
        { data: null, error: { message: "relationship missing" } },
        { data: null, error: { message: "relationship missing" } },
      ],
    },
    calls,
  );
  const repository = createSupabasePlatformCatalogRepository(publicClient);

  const listResult = await repository.listServices();
  const getResult = await repository.getService("service-1");

  assert.equal(listResult.error?.message, "relationship missing");
  assert.equal(getResult.error?.message, "relationship missing");
  assert.deepEqual(calls, [
    {
      client: "public",
      table: RESERVATION_SUPABASE_TABLES.services,
      select: RESERVATION_SUPABASE_SELECTS.catalogServiceWithResources,
      filters: [],
      orders: ["name"],
    },
    {
      client: "public",
      table: RESERVATION_SUPABASE_TABLES.services,
      select: RESERVATION_SUPABASE_SELECTS.catalogServiceWithResources,
      filters: [{ column: "id", value: "service-1" }],
      orders: [],
      cardinality: "single",
    },
  ]);
});

test("catalog repository applies resource service filter with admin client", async () => {
  const calls: RecordedCatalogRead[] = [];
  const publicClient = createCatalogReadClient("public", {}, calls);
  const adminClient = createCatalogReadClient(
    "admin",
    {
      [RESERVATION_SUPABASE_TABLES.reservableResources]: [
        { data: [{ id: "resource-1", service_id: "service-1" }], error: null },
        { data: { id: "resource-1", service_id: "service-1" }, error: null },
      ],
    },
    calls,
  );
  const repository = createSupabasePlatformCatalogRepository({ publicClient, adminClient });

  await repository.listResources({ serviceId: "service-1" });
  await repository.getResource("resource-1");

  assert.deepEqual(calls, [
    {
      client: "admin",
      table: RESERVATION_SUPABASE_TABLES.reservableResources,
      select: RESERVATION_SUPABASE_SELECTS.catalogResource,
      filters: [{ column: "service_id", value: "service-1" }],
      orders: ["label"],
    },
    {
      client: "admin",
      table: RESERVATION_SUPABASE_TABLES.reservableResources,
      select: RESERVATION_SUPABASE_SELECTS.catalogResource,
      filters: [{ column: "id", value: "resource-1" }],
      orders: [],
      cardinality: "single",
    },
  ]);
});

test("availability repository reads and adapts one database snapshot", async () => {
  const rpcCalls: Array<{ fn: string; params?: Record<string, unknown> }> = [];
  const publicClient = {
    from() {
      throw new Error("public client should not read availability tables");
    },
  };
  const adminClient = {
    from() {
      throw new Error("availability snapshot should not issue table reads");
    },
    async rpc(fn: string, params?: Record<string, unknown>) {
      rpcCalls.push({ fn, params });
      return {
        data: {
          service: {
            id: "service-1",
            name: "Racing Simulator",
            total_seats: 2,
            created_at: "2026-01-01T00:00:00.000Z",
            resource_kind: "seat",
            selection_mode: "assigned_resource",
            reservation_policy: { max_quantity: 2 },
          },
          bookings: [{
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
            interface_type: "chat",
          }],
          maintenance: [{ seat_label: "RS2" }],
          resources: [{
            id: "resource-1",
            service_id: "service-1",
            label: "RS1",
            kind: "seat",
            is_active: true,
            capacity: 1,
            metadata: { row: 1 },
          }],
          layout: {
            layout_kind: "grid",
            metadata: { columns: 2 },
          },
        },
        error: null,
      };
    },
  };
  const repository = createSupabaseAvailabilityRepository({ publicClient, adminClient });

  const availability = await repository.readAvailability({
    serviceId: "service-1",
    date: "2026-01-02",
  });

  assert.equal(availability.service.id, "service-1");
  assert.equal(availability.service.layout.kind, "grid");
  assert.deepEqual(availability.service.resources?.map((resource) => resource.label), ["RS1"]);
  assert.deepEqual(availability.bookings.map((booking) => booking.interface_type), ["chat"]);
  assert.deepEqual(availability.maintenanceResourceLabels, ["RS2"]);
  assert.deepEqual(rpcCalls, [
    {
      fn: RESERVATION_SUPABASE_AVAILABILITY_RPCS.readSnapshot,
      params: { p_service_id: "service-1", p_date: "2026-01-02" },
    },
  ]);
});

test("availability repository propagates Supabase read errors unchanged", async () => {
  const supabaseError = { message: "bookings unavailable", code: "XX000" };
  const repository = createSupabaseAvailabilityRepository({
    from() {
      throw new Error("availability snapshot should not issue table reads");
    },
    async rpc() {
      return { data: null, error: supabaseError };
    },
  });

  await assert.rejects(
    () => repository.readAvailability({ serviceId: "service-1", date: "2026-01-02" }),
    (error) => error === supabaseError,
  );
});

test("availability repository maps an empty snapshot to service not found", async () => {
  const repository = createSupabaseAvailabilityRepository({
    from() {
      throw new Error("availability snapshot should not issue table reads");
    },
    async rpc() {
      return { data: null, error: null };
    },
  });

  await assert.rejects(
    () => repository.readAvailability({ serviceId: "missing", date: "2026-01-02" }),
    (error: unknown) => (
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "PGRST116"
    ),
  );
});

test("availability repository rejects malformed snapshot envelopes", async () => {
  const repository = createSupabaseAvailabilityRepository({
    from() {
      throw new Error("availability snapshot should not issue table reads");
    },
    async rpc() {
      return { data: { service: {}, bookings: null }, error: null };
    },
  });

  await assert.rejects(
    () => repository.readAvailability({ serviceId: "service-1", date: "2026-01-02" }),
    /Availability snapshot RPC returned an invalid response/,
  );
});

test("reservation resource label repository owns id-to-label query shape", async () => {
  type RecordedLabelRead = {
    table: string;
    select?: string;
    filters: Array<{ column: string; value: unknown }>;
    inFilters: Array<{ column: string; values: unknown[] }>;
  };
  const calls: RecordedLabelRead[] = [];
  const client = {
    from(table: string) {
      const call: RecordedLabelRead = { table, filters: [], inFilters: [] };
      calls.push(call);
      const result = Promise.resolve({
        data: [
          { id: "resource-1", label: "Room A" },
          { id: "resource-2", label: "Room B" },
        ],
        error: null,
      });

      return {
        select(columns?: string) {
          call.select = columns;
          return this;
        },
        eq(column: string, value: unknown) {
          call.filters.push({ column, value });
          return this;
        },
        in(column: string, values: unknown[]) {
          call.inFilters.push({ column, values });
          return this;
        },
        then(resolve: (value: SupabaseTestResult) => unknown) {
          return result.then(resolve);
        },
      };
    },
  };
  const repository = createSupabaseReservationResourceLabelRepository(client);

  const labels = await repository.resolveLabelsById("service-1", ["resource-1", "resource-2"]);

  assert.deepEqual(Object.fromEntries(labels), {
    "resource-1": "Room A",
    "resource-2": "Room B",
  });
  assert.deepEqual(calls, [
    {
      table: RESERVATION_SUPABASE_TABLES.reservableResources,
      select: RESERVATION_SUPABASE_SELECTS.resourceLabel,
      filters: [{ column: "service_id", value: "service-1" }],
      inFilters: [{ column: "id", values: ["resource-1", "resource-2"] }],
    },
  ]);
});

test("reservation resource label repository skips Supabase reads when no ids are requested", async () => {
  const repository = createSupabaseReservationResourceLabelRepository({
    from() {
      throw new Error("from() should not be called without resource ids");
    },
  });

  const labels = await repository.resolveLabelsById("service-1", []);

  assert.equal(labels.size, 0);
});

test("reservation resource label repository propagates Supabase errors unchanged", async () => {
  const supabaseError = { message: "resource labels unavailable", code: "XX000" };
  const client = {
    from() {
      const result = Promise.resolve({ data: null, error: supabaseError });

      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        then(resolve: (value: SupabaseTestResult) => unknown) {
          return result.then(resolve);
        },
      };
    },
  };
  const repository = createSupabaseReservationResourceLabelRepository(client);

  await assert.rejects(
    () => repository.resolveLabelsById("service-1", ["resource-1"]),
    (error) => error === supabaseError,
  );
});

test("reservation resource label repository omits rows without usable labels or scoped matches", async () => {
  const client = {
    from() {
      const result = Promise.resolve({
        data: [
          { id: "resource-1", label: "Room A" },
          { id: "resource-2", label: null },
          { id: 3, label: "Room C" },
        ],
        error: null,
      });

      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        then(resolve: (value: SupabaseTestResult) => unknown) {
          return result.then(resolve);
        },
      };
    },
  };
  const repository = createSupabaseReservationResourceLabelRepository(client);

  const labels = await repository.resolveLabelsById("service-1", [
    "resource-1",
    "resource-2",
    "resource-3",
    "cross-service-resource",
  ]);

  assert.deepEqual(Object.fromEntries(labels), { "resource-1": "Room A" });
  assert.equal(labels.get("resource-2"), undefined);
  assert.equal(labels.get("resource-3"), undefined);
  assert.equal(labels.get("cross-service-resource"), undefined);
});

test("reservation read repository owns list query shape with search and limit", async () => {
  const calls: RecordedReservationCompatibilityCall[] = [];
  const client = createReservationCompatibilityClient(
    [{ data: [{ id: "booking-1" }], error: null }],
    calls,
  );
  const repository = createSupabaseReservationReadRepository(client);

  const result = await repository.listReservations({
    search: "Ada",
    searchFilterExpression: "user_name.ilike.%Ada%",
    limit: 100,
  });

  assert.deepEqual(result, { data: [{ id: "booking-1" }], error: null });
  assert.deepEqual(calls, [
    {
      table: RESERVATION_SUPABASE_TABLES.bookings,
      selectCalls: [RESERVATION_SUPABASE_SELECTS.reservationCompatibility],
      filters: [],
      orFilters: ["user_name.ilike.%Ada%"],
      orders: [{ column: "booking_date", options: { ascending: false } }],
      limits: [100],
    },
  ]);
});

test("reservation read repository skips optional list filters when absent", async () => {
  const calls: RecordedReservationCompatibilityCall[] = [];
  const client = createReservationCompatibilityClient(
    [{ data: [{ id: "booking-2" }], error: null }],
    calls,
  );
  const repository = createSupabaseReservationReadRepository(client);

  await repository.listReservations({
    search: null,
    searchFilterExpression: null,
    limit: null,
  });

  assert.deepEqual(calls, [
    {
      table: RESERVATION_SUPABASE_TABLES.bookings,
      selectCalls: [RESERVATION_SUPABASE_SELECTS.reservationCompatibility],
      filters: [],
      orFilters: [],
      orders: [{ column: "booking_date", options: { ascending: false } }],
      limits: [],
    },
  ]);
});

test("reservation read repository owns exact summary count query shape", async () => {
  const calls: RecordedReservationCompatibilityCall[] = [];
  const client = createReservationCompatibilityClient(
    [
      { data: null, count: 42, error: null },
      { data: null, count: 7, error: null },
    ],
    calls,
  );
  const repository = createSupabaseReservationReadRepository(client);

  const result = await repository.getReservationsSummary?.({
    search: "Ada",
    searchFilterExpression: "user_name.ilike.%Ada%",
    today: "2026-06-13",
  });

  assert.deepEqual(result, {
    summary: {
      total: 42,
      confirmed_today: 7,
    },
  });
  assert.deepEqual(calls, [
    {
      table: RESERVATION_SUPABASE_TABLES.bookings,
      selectCalls: [{ columns: "id", options: { count: "exact", head: true } }],
      filters: [],
      orFilters: ["user_name.ilike.%Ada%"],
      orders: [],
      limits: [],
    },
    {
      table: RESERVATION_SUPABASE_TABLES.bookings,
      selectCalls: [{ columns: "id", options: { count: "exact", head: true } }],
      filters: [
        { column: "booking_date", value: "2026-06-13" },
        { column: "status", value: "confirmed" },
      ],
      orFilters: ["user_name.ilike.%Ada%"],
      orders: [],
      limits: [],
    },
  ]);
});

test("reservation read repository owns read-by-id query shape", async () => {
  const calls: RecordedReservationCompatibilityCall[] = [];
  const client = createReservationCompatibilityClient(
    [{ data: { id: "booking-1" }, error: null }],
    calls,
  );
  const repository = createSupabaseReservationReadRepository(client);

  const result = await repository.readReservationById("booking-1");

  assert.deepEqual(result, { data: { id: "booking-1" }, error: null });
  assert.deepEqual(calls, [
    {
      table: RESERVATION_SUPABASE_TABLES.bookings,
      selectCalls: [RESERVATION_SUPABASE_SELECTS.reservationCompatibility],
      filters: [{ column: "id", value: "booking-1" }],
      orFilters: [],
      orders: [],
      limits: [],
      cardinality: "single",
    },
  ]);
});

test("reservation mutation repository owns update query shape", async () => {
  const calls: RecordedReservationCompatibilityCall[] = [];
  const client = createReservationCompatibilityClient(
    [{ data: { id: "booking-1", status: "cancelled" }, error: null }],
    calls,
  );
  const repository = createSupabaseReservationMutationRepository(client);
  const patch = {
    status: "cancelled",
    updated_at: "2026-01-01T00:00:00.000Z",
  } as const;

  const result = await repository.updateReservation({
    reservationId: "booking-1",
    patch,
  });

  assert.deepEqual(result, {
    data: { id: "booking-1", status: "cancelled" },
    error: null,
  });
  assert.deepEqual(calls, [
    {
      table: RESERVATION_SUPABASE_TABLES.bookings,
      selectCalls: [undefined],
      filters: [{ column: "id", value: "booking-1" }],
      orFilters: [],
      orders: [],
      limits: [],
      update: patch,
      cardinality: "single",
    },
  ]);
});

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

test("tenant venue repository reads tenant and venue context rows", async () => {
  const calls: RecordedContextRead[] = [];
  const client = createContextReadClient(
    {
      [RESERVATION_SUPABASE_TABLES.platformTenants]: {
        data: { id: "tenant-1" },
        error: null,
      },
      [RESERVATION_SUPABASE_TABLES.venues]: {
        data: { id: "venue-1", tenant_id: "tenant-1" },
        error: null,
      },
    },
    calls,
  );
  const repository = createSupabaseTenantVenueRepository(client);

  const tenant = await repository.getTenant("tenant-1");
  const venue = await repository.getVenue("venue-1");

  assert.deepEqual(tenant, { data: { id: "tenant-1" } });
  assert.deepEqual(venue, { data: { id: "venue-1", tenant_id: "tenant-1" } });
  assert.match(RESERVATION_SUPABASE_SELECTS.venueContext, /\btenant_id\b/);
  assert.deepEqual(calls, [
    {
      table: RESERVATION_SUPABASE_TABLES.platformTenants,
      select: RESERVATION_SUPABASE_SELECTS.platformTenant,
      filters: [{ column: "id", value: "tenant-1" }],
      cardinality: "maybeSingle",
    },
    {
      table: RESERVATION_SUPABASE_TABLES.venues,
      select: RESERVATION_SUPABASE_SELECTS.venueContext,
      filters: [{ column: "id", value: "venue-1" }],
      cardinality: "maybeSingle",
    },
  ]);
});

test("tenant venue repository surfaces Supabase read errors unchanged", async () => {
  const tenantError = { message: "missing tenants table", code: "42P01" };
  const venueError = { message: "venue read failed", code: "XX000", status: 500 };
  const calls: RecordedContextRead[] = [];
  const client = createContextReadClient(
    {
      [RESERVATION_SUPABASE_TABLES.platformTenants]: {
        data: null,
        error: tenantError,
      },
      [RESERVATION_SUPABASE_TABLES.venues]: {
        data: null,
        error: venueError,
      },
    },
    calls,
  );
  const repository = createSupabaseTenantVenueRepository(client);

  const tenant = await repository.getTenant("tenant-1");
  const venue = await repository.getVenue("venue-1");

  assert.equal(tenant.error, tenantError);
  assert.equal(venue.error, venueError);
  assert.deepEqual(calls.map((call) => call.table), [
    RESERVATION_SUPABASE_TABLES.platformTenants,
    RESERVATION_SUPABASE_TABLES.venues,
  ]);
});

test("resource maintenance repository owns Supabase lifecycle query shapes", async () => {
  type RecordedMaintenanceCall = {
    table: string;
    select?: string;
    filters: Array<{ column: string; value: unknown }>;
    orders: string[];
    cardinality?: "single" | "maybeSingle";
    upsert?: { row: unknown; options?: Record<string, unknown> };
    update?: unknown;
  };
  const calls: RecordedMaintenanceCall[] = [];
  const createError = { message: "duplicate maintenance", code: "23505" };
  const results: SupabaseTestResult[] = [
    {
      data: [
        {
          id: "maintenance-active",
          service_id: "service-1",
          seat_label: "Room A",
          is_active: true,
        },
      ],
      error: null,
    },
    { data: { id: "resource-1", service_id: "service-1", label: "Room A" }, error: null },
    { data: { total_seats: 1, selection_mode: "assigned_resource" }, error: null },
    { data: null, error: createError },
    { data: { id: "maintenance-1", service_id: "service-1", seat_label: "Room A" }, error: null },
  ];
  const client = {
    from(table: string) {
      const call: RecordedMaintenanceCall = { table, filters: [], orders: [] };
      calls.push(call);
      const result = Promise.resolve(results.shift() ?? { data: null, error: null });

      return {
        select(columns?: string) {
          call.select = columns;
          return this;
        },
        eq(column: string, value: unknown) {
          call.filters.push({ column, value });
          return this;
        },
        order(column: string) {
          call.orders.push(column);
          return this;
        },
        insert() {
          throw new Error("insert() should not be called for maintenance lifecycle");
        },
        upsert(row: unknown, options?: Record<string, unknown>) {
          call.upsert = { row, options };
          return this;
        },
        update(row: unknown) {
          call.update = row;
          return this;
        },
        single() {
          call.cardinality = "single";
          return result;
        },
        maybeSingle() {
          call.cardinality = "maybeSingle";
          return result;
        },
        then(resolve: (value: SupabaseTestResult) => unknown) {
          return result.then(resolve);
        },
      };
    },
  };
  const repository = createSupabaseResourceMaintenanceRepository(client);

  const listed = await repository.listActiveMaintenance("service-1");
  const resolved = await repository.resolveResource({
    service_id: "fallback-service",
    resource_id: "resource-1",
  });
  const service = await repository.loadService(resolved.serviceId!);
  const created = await repository.createMaintenance({
    service_id: "service-1",
    seat_label: "Room A",
    reason: "Repair",
  });
  const ended = await repository.endMaintenance("maintenance-1", { reason: "Fixed" });

  assert.deepEqual(listed.data, [
    {
      id: "maintenance-active",
      service_id: "service-1",
      seat_label: "Room A",
      is_active: true,
    },
  ]);
  assert.deepEqual(resolved, { serviceId: "service-1", label: "Room A" });
  assert.deepEqual(service, {
    data: { total_seats: 1, selection_mode: "assigned_resource" },
    error: null,
  });
  assert.equal(created.error, createError);
  assert.deepEqual(ended.data, {
    id: "maintenance-1",
    service_id: "service-1",
    seat_label: "Room A",
  });
  assert.deepEqual(calls, [
    {
      table: RESERVATION_SUPABASE_TABLES.serviceSeatMaintenance,
      select: RESERVATION_SUPABASE_SELECTS.resourceMaintenance,
      filters: [
        { column: "service_id", value: "service-1" },
        { column: "is_active", value: true },
      ],
      orders: ["seat_label"],
    },
    {
      table: RESERVATION_SUPABASE_TABLES.reservableResources,
      select: RESERVATION_SUPABASE_SELECTS.resourceMaintenanceResource,
      filters: [{ column: "id", value: "resource-1" }],
      orders: [],
      cardinality: "maybeSingle",
    },
    {
      table: RESERVATION_SUPABASE_TABLES.services,
      select: RESERVATION_SUPABASE_SELECTS.resourceMaintenanceService,
      filters: [{ column: "id", value: "service-1" }],
      orders: [],
      cardinality: "single",
    },
    {
      table: RESERVATION_SUPABASE_TABLES.serviceSeatMaintenance,
      select: RESERVATION_SUPABASE_SELECTS.resourceMaintenance,
      filters: [],
      orders: [],
      cardinality: "single",
      upsert: {
        row: {
          service_id: "service-1",
          seat_label: "Room A",
          reason: "Repair",
        },
        options: { onConflict: "service_id,seat_label" },
      },
    },
    {
      table: RESERVATION_SUPABASE_TABLES.serviceSeatMaintenance,
      select: RESERVATION_SUPABASE_SELECTS.resourceMaintenance,
      filters: [{ column: "id", value: "maintenance-1" }],
      orders: [],
      cardinality: "single",
      update: {
        is_active: false,
        reason: "Fixed",
      },
    },
  ]);
  assert.equal(typeof createSupabaseResourceMaintenanceRepository, "function");
});

test("resource maintenance repository fails closed for missing resource ids", async () => {
  const client = {
    from(table: string) {
      assert.equal(table, RESERVATION_SUPABASE_TABLES.reservableResources);
      const result = Promise.resolve({ data: null, error: null });

      return {
        select(columns?: string) {
          assert.equal(columns, RESERVATION_SUPABASE_SELECTS.resourceMaintenanceResource);
          return this;
        },
        eq(column: string, value: unknown) {
          assert.equal(column, "id");
          assert.equal(value, "missing-resource");
          return this;
        },
        order() {
          throw new Error("order() should not be called for resource resolution");
        },
        insert() {
          throw new Error("insert() should not be called for resource resolution");
        },
        upsert() {
          throw new Error("upsert() should not be called for resource resolution");
        },
        update() {
          throw new Error("update() should not be called for resource resolution");
        },
        single() {
          throw new Error("single() should not be called for resource resolution");
        },
        maybeSingle() {
          return result;
        },
        then(resolve: (value: SupabaseTestResult) => unknown) {
          return result.then(resolve);
        },
      };
    },
  };
  const repository = createSupabaseResourceMaintenanceRepository(client);

  await assert.rejects(
    () => repository.resolveResource({
      service_id: "service-1",
      resource_id: "missing-resource",
    }),
    (error) => {
      assert.equal((error as SupabaseTestResult["error"])?.code, "PGRST116");
      assert.equal((error as SupabaseTestResult["error"])?.status, 404);
      assert.match(
        String((error as SupabaseTestResult["error"])?.message),
        /resource not found/i,
      );
      return true;
    },
  );
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

test("idempotency repository claims records through the atomic RPC", async () => {
  const rpcCalls: Array<{ fn: string; params?: Record<string, unknown> }> = [];
  const client = {
    from() {
      throw new Error("from() should not be called for idempotency");
    },
    async rpc(fn: string, params?: Record<string, unknown>) {
      rpcCalls.push({ fn, params });

      return {
        data: [{
          claimed: true,
          tenant_id: "tenant-1",
          key: "idem-1",
          method: "POST",
          path: "/v1/reservations",
          fingerprint: "{\"service_id\":\"service-1\"}",
          status: "in_progress",
          response_status: null,
          response_body: null,
        }],
        error: null,
      };
    },
  };
  const repository = createSupabaseIdempotencyRepository(client);
  const existing = await repository.claimInProgress({
    tenantId: "tenant-1",
    key: "idem-1",
    method: "POST",
    path: "/v1/reservations",
    fingerprint: "{\"service_id\":\"service-1\"}",
    status: "in_progress",
  });

  assert.equal(existing, null);
  assert.deepEqual(rpcCalls, [
    {
      fn: RESERVATION_SUPABASE_IDEMPOTENCY_RPCS.claim,
      params: {
        p_key: "idem-1",
        p_tenant_id: "tenant-1",
        p_method: "POST",
        p_path: "/v1/reservations",
        p_fingerprint: "{\"service_id\":\"service-1\"}",
      },
    },
  ]);
});

test("idempotency repository maps existing completed RPC rows", async () => {
  const client = {
    from() {
      throw new Error("from() should not be called for idempotency");
    },
    async rpc() {
      return {
        data: [{
          claimed: false,
          tenant_id: "tenant-1",
          key: "idem-1",
          method: "POST",
          path: "/v1/reservations",
          fingerprint: "{\"service_id\":\"service-1\"}",
          status: "completed",
          response_status: 201,
          response_body: {
            data: { id: "booking-1" },
          },
        }],
        error: null,
      };
    },
  };
  const repository = createSupabaseIdempotencyRepository(client);
  const existing = await repository.claimInProgress({
    tenantId: "tenant-1",
    key: "idem-1",
    method: "POST",
    path: "/v1/reservations",
    fingerprint: "{\"service_id\":\"service-1\"}",
    status: "in_progress",
  });

  assert.deepEqual(existing, {
    tenantId: "tenant-1",
    key: "idem-1",
    method: "POST",
    path: "/v1/reservations",
    fingerprint: "{\"service_id\":\"service-1\"}",
    status: "completed",
    response: {
      status: 201,
      body: {
        data: { id: "booking-1" },
      },
    },
  });
});

test("idempotency repository hides internal unscoped tenant sentinel", async () => {
  const client = {
    from() {
      throw new Error("from() should not be called for idempotency");
    },
    async rpc() {
      return {
        data: [{
          claimed: false,
          tenant_id: "__platform_unscoped__",
          key: "idem-1",
          method: "POST",
          path: "/v1/reservations",
          fingerprint: "{\"service_id\":\"service-1\"}",
          status: "in_progress",
          response_status: null,
          response_body: null,
        }],
        error: null,
      };
    },
  };
  const repository = createSupabaseIdempotencyRepository(client);
  const existing = await repository.claimInProgress({
    key: "idem-1",
    method: "POST",
    path: "/v1/reservations",
    fingerprint: "{\"service_id\":\"service-1\"}",
    status: "in_progress",
  });

  assert.equal(existing?.tenantId, undefined);
  assert.equal(existing?.status, "in_progress");
});

test("idempotency repository stores completed responses through RPC", async () => {
  const rpcCalls: Array<{ fn: string; params?: Record<string, unknown> }> = [];
  const client = {
    from() {
      throw new Error("from() should not be called for idempotency");
    },
    async rpc(fn: string, params?: Record<string, unknown>) {
      rpcCalls.push({ fn, params });

      return { data: null, error: null };
    },
  };
  const repository = createSupabaseIdempotencyRepository(client);

  await repository.storeCompleted({
    tenantId: "tenant-1",
    key: "idem-1",
    method: "POST",
    path: "/v1/reservations",
    fingerprint: "{\"service_id\":\"service-1\"}",
    status: "completed",
    response: {
      status: 201,
      body: { data: { id: "booking-1" } },
    },
  });

  assert.deepEqual(rpcCalls, [
    {
      fn: RESERVATION_SUPABASE_IDEMPOTENCY_RPCS.storeCompleted,
      params: {
        p_key: "idem-1",
        p_tenant_id: "tenant-1",
        p_method: "POST",
        p_path: "/v1/reservations",
        p_fingerprint: "{\"service_id\":\"service-1\"}",
        p_response_status: 201,
        p_response_body: { data: { id: "booking-1" } },
      },
    },
  ]);
});

test("idempotency repository surfaces store identity mismatch errors", async () => {
  const client = {
    from() {
      throw new Error("from() should not be called for idempotency");
    },
    async rpc() {
      return {
        data: null,
        error: { message: "idempotency record identity mismatch" },
      };
    },
  };
  const repository = createSupabaseIdempotencyRepository(client);

  await assert.rejects(
    () => repository.storeCompleted({
      tenantId: "tenant-1",
      key: "idem-1",
      method: "POST",
      path: "/v1/reservations",
      fingerprint: "{\"service_id\":\"service-1\"}",
      status: "completed",
      response: {
        status: 201,
        body: { data: { id: "booking-1" } },
      },
    }),
    /idempotency record identity mismatch/,
  );
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
