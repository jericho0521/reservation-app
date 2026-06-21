import assert from "node:assert/strict";
import test from "node:test";
import {
  createReservationFromBookingForm,
  getReservationApiBasePath,
  getReservationApiMode,
  getReservationPlatformBaseUrl,
  getReservationPlatformContext,
  getReservationAvailability,
  legacyBookingToPlatformInput,
  listAdminReservations,
  listReservationServices,
  listResourceMaintenanceSeats,
  platformAvailabilityToLegacyAvailability,
  platformReservationToAdminBooking,
  platformServiceToLegacyService,
  saveResourceMaintenanceSeats,
  updateReservationStatus,
} from "./reservation-platform-client";

const originalFetch = globalThis.fetch;
const originalPlatformBaseUrl = process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL;
const originalTenantId = process.env.NEXT_PUBLIC_RESERVATION_TENANT_ID;
const originalVenueId = process.env.NEXT_PUBLIC_RESERVATION_VENUE_ID;

test.beforeEach(() => {
  globalThis.fetch = originalFetch;
  clearReservationEnv();
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test.after(() => {
  restoreReservationEnv();
});

test("getReservationApiMode defaults local and opts into platform", () => {
  assert.equal(getReservationApiMode({ NEXT_PUBLIC_RESERVATION_API_MODE: undefined }), "local");
  assert.equal(getReservationApiMode({ NEXT_PUBLIC_RESERVATION_API_MODE: "platform" }), "platform");
  assert.equal(getReservationApiBasePath("local"), "/api");
  assert.equal(getReservationApiBasePath("platform"), "/api/v1");
});

test("getReservationPlatformBaseUrl defaults empty and trims trailing slashes", () => {
  assert.equal(getReservationPlatformBaseUrl({
    NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL: undefined,
  }), "");
  assert.equal(getReservationPlatformBaseUrl({
    NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL: " https://reservations.example.test/// ",
  }), "https://reservations.example.test");

  process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL = "https://reservations.example.test/";
  assert.equal(getReservationApiBasePath("platform"), "https://reservations.example.test/v1");
});

test("getReservationPlatformContext reads browser-safe tenant and venue env", () => {
  assert.deepEqual(getReservationPlatformContext({
    NEXT_PUBLIC_RESERVATION_TENANT_ID: "tenant_123",
    NEXT_PUBLIC_RESERVATION_VENUE_ID: "venue_456",
  }), {
    tenantId: "tenant_123",
    venueId: "venue_456",
  });

  assert.deepEqual(getReservationPlatformContext({
    NEXT_PUBLIC_RESERVATION_TENANT_ID: "",
    NEXT_PUBLIC_RESERVATION_VENUE_ID: undefined,
  }), {
    tenantId: undefined,
    venueId: undefined,
  });
});

test("configured platform mode uses standalone /v1 URLs and forbids compatibility fallbacks", async () => {
  setPlatformContextEnv();
  process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL = "https://reservations.example.test/";
  const frontendBaseUrl = "https://frontend.example.test";
  const calls: string[] = [];

  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    calls.push(requestUrl);

    if (requestUrl.endsWith("/services")) {
      return jsonResponse({ services: [] });
    }
    if (requestUrl.includes("/availability?")) {
      return jsonResponse({ slots: [] });
    }
    if (requestUrl.includes("/resource-maintenance?")) {
      return jsonResponse({
        maintenance: [{
          maintenance_id: "maint_1",
          service_id: "svc_123",
          reason: "Old",
          metadata: { resource_label: "A1" },
        }],
      });
    }
    if (requestUrl.includes("/reservations?")) {
      return jsonResponse({ reservations: [] });
    }
    return jsonResponse({});
  };

  await listReservationServices("platform");
  await getReservationAvailability("svc_123", "2026-01-02", "platform");
  await listResourceMaintenanceSeats("svc_123", "platform");
  await saveResourceMaintenanceSeats({
    serviceId: "svc_123",
    seatLabels: ["A2"],
    reason: "Repair",
  }, "platform");
  await createReservationFromBookingForm({
    service_id: "svc_123",
    booking_date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    seats_booked: 1,
    user_name: "Ada",
    user_email: "ada@example.com",
  }, "platform");
  await updateReservationStatus("res_123", "completed", "platform");
  await listAdminReservations({ search: "Ada", baseUrl: frontendBaseUrl }, "platform");

  assert.deepEqual(calls, [
    "https://reservations.example.test/v1/services",
    "https://reservations.example.test/v1/availability?service_id=svc_123&date=2026-01-02",
    "https://reservations.example.test/v1/resource-maintenance?service_id=svc_123",
    "https://reservations.example.test/v1/resource-maintenance?service_id=svc_123",
    "https://reservations.example.test/v1/resource-maintenance",
    "https://reservations.example.test/v1/resource-maintenance/maint_1/end",
    "https://reservations.example.test/v1/reservations",
    "https://reservations.example.test/v1/reservations/res_123",
    "https://reservations.example.test/v1/reservations?search=Ada",
  ]);
  assertNoConfiguredPlatformCompatibilityFallbacks(calls, frontendBaseUrl);
});

test("listAdminReservations platform base URL overrides explicit SSR baseUrl", async () => {
  process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL = "https://configured.example.test";
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse({ reservations: [] });
  };

  await listAdminReservations({
    baseUrl: "https://explicit.example.test",
  }, "platform");

  assert.deepEqual(calls, [
    "https://configured.example.test/v1/reservations",
  ]);
});

test("listAdminReservations keeps explicit baseUrl on compatibility /api/v1 when env is absent", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse({ reservations: [] });
  };

  await listAdminReservations({
    baseUrl: "https://explicit.example.test",
  }, "platform");

  assert.deepEqual(calls, [
    "https://explicit.example.test/api/v1/reservations",
  ]);
});

test("listAdminReservations uses explicit standalone platformBaseUrl when env is absent", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse({ reservations: [] });
  };

  await listAdminReservations({
    platformBaseUrl: "https://standalone.example.test",
  }, "platform");

  assert.deepEqual(calls, [
    "https://standalone.example.test/v1/reservations",
  ]);
});

test("local mode ignores configured platform base URL and keeps local API paths", async () => {
  process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL = "https://reservations.example.test";
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    calls.push(requestUrl);

    if (requestUrl === "/api/services") {
      return jsonResponse([]);
    }
    if (requestUrl.startsWith("/api/availability?")) {
      return jsonResponse({ timeSlots: [] });
    }
    if (requestUrl === "/api/bookings") {
      return jsonResponse([]);
    }
    return jsonResponse({});
  };

  await listReservationServices("local");
  await getReservationAvailability("svc_123", "2026-01-02", "local");
  await createReservationFromBookingForm({
    service_id: "svc_123",
    booking_date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    seats_booked: 1,
    user_name: "Ada",
    user_email: "ada@example.com",
  }, "local");
  await updateReservationStatus("res_123", "completed", "local");
  await listAdminReservations({}, "local");

  assert.deepEqual(calls, [
    "/api/services",
    "/api/availability?service_id=svc_123&date=2026-01-02",
    "/api/bookings",
    "/api/bookings/res_123",
    "/api/bookings",
  ]);
});

test("listReservationServices maps platform service envelope to legacy UI services", async () => {
  setPlatformContextEnv();
  const calls: Array<{ url: string; headers: Headers }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) });
    return jsonResponse({
      services: [{
        service_id: "svc_123",
        name: "Simulator",
        description: "Racing",
        total_quantity: 2,
        resource_kind: "station",
        resource_strategy: "assigned_resource",
        reservation_policy: {
          kind: "assigned_resource",
          selection_mode: "assigned_resource",
          max_quantity: 2,
          require_resource_labels: true,
          allow_partial_capacity: false,
        },
        resources: [{
          resource_id: "res_1",
          service_id: "svc_123",
          label: "Station 1",
          kind: "station",
          is_active: true,
          capacity: 1,
        }],
        layout: {
          layout_id: "layout_123",
          kind: "grid",
          metadata: { columns: 2, rows: 1 },
        },
        metadata: { created_at: "2026-01-01" },
      }],
    });
  };

  const services = await listReservationServices("platform");

  assert.equal(calls[0]?.url, "/api/v1/services");
  assertPlatformContextHeaders(calls[0]?.headers);
  assert.deepEqual(services, [{
    id: "svc_123",
    name: "Simulator",
    description: "Racing",
    total_seats: 2,
    created_at: "2026-01-01",
    resource_kind: "station",
    selection_mode: "assigned_resource",
    reservation_policy: {
      kind: "assigned_resource",
      selection_mode: "assigned_resource",
      max_quantity: 2,
      require_resource_labels: true,
      allow_partial_capacity: false,
    },
    resources: [{
      id: "res_1",
      service_id: "svc_123",
      label: "Station 1",
      kind: "station",
      is_active: true,
      capacity: 1,
      metadata: undefined,
    }],
    layout: {
      kind: "grid",
      columns: 2,
      rows: 1,
      group_label: undefined,
    },
  }]);
});

test("getReservationAvailability maps platform slots to legacy UI timeSlots", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse({
      slots: [{
        start_time: "12:00",
        end_time: "13:00",
        available_quantity: 3,
        is_available: true,
        taken_resource_labels: ["A2"],
        maintenance_resource_labels: ["A3"],
      }],
      total_quantity: 4,
      resource_kind: "seat",
      resource_strategy: "assigned_resource",
      reservation_policy: {
        kind: "assigned_resource",
        selection_mode: "assigned_resource",
        max_quantity: 4,
        require_resource_labels: true,
        allow_partial_capacity: false,
      },
      resources: [{
        resource_id: "res_1",
        service_id: "svc_123",
        label: "A1",
        kind: "seat",
        is_active: true,
      }],
      layout: {
        layout_id: "layout_123",
        kind: "grid",
        metadata: { columns: 4, rows: 1 },
      },
    });
  };

  const availability = await getReservationAvailability("svc_123", "2026-01-02", "platform");

  assert.equal(calls[0], "/api/v1/availability?service_id=svc_123&date=2026-01-02");
  assert.deepEqual(availability, {
    timeSlots: [{
      start_time: "12:00",
      end_time: "13:00",
      available_seats: 3,
      is_available: true,
      taken_seat_labels: ["A2"],
      maintenance_seat_labels: ["A3"],
    }],
    totalSeats: 4,
    resource_kind: "seat",
    selection_mode: "assigned_resource",
    reservation_policy: {
      kind: "assigned_resource",
      selection_mode: "assigned_resource",
      max_quantity: 4,
      require_resource_labels: true,
      allow_partial_capacity: false,
    },
    resources: [{
      id: "res_1",
      service_id: "svc_123",
      label: "A1",
      kind: "seat",
      is_active: true,
      capacity: undefined,
      metadata: undefined,
    }],
    layout: {
      kind: "grid",
      columns: 4,
      rows: 1,
      group_label: undefined,
    },
  });
});

test("listResourceMaintenanceSeats maps platform maintenance rows to legacy admin rows", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse({
      maintenance: [{
        maintenance_id: "maint_123",
        service_id: "svc_123",
        resource_id: "res_1",
        reason: "Repair",
        metadata: {
          resource_label: "A1",
        },
      }],
    });
  };

  const seats = await listResourceMaintenanceSeats("svc_123", "platform");

  assert.equal(calls[0], "/api/v1/resource-maintenance?service_id=svc_123");
  assert.deepEqual(seats, [{
    maintenance_id: "maint_123",
    seat_label: "A1",
    reason: "Repair",
  }]);
});

test("listResourceMaintenanceSeats keeps local maintenance response shape", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse({
      seats: [{ seat_label: "A2", reason: null }],
    });
  };

  const seats = await listResourceMaintenanceSeats("svc_123", "local");

  assert.equal(calls[0], "/api/seat-maintenance?service_id=svc_123");
  assert.deepEqual(seats, [{ seat_label: "A2", reason: null }]);
});

test("saveResourceMaintenanceSeats preserves local replace-all request shape", async () => {
  const calls: Array<{ url: string; method?: string; body: unknown }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined,
    });
    return jsonResponse({ seat_labels: ["A1"] });
  };

  const labels = await saveResourceMaintenanceSeats({
    serviceId: "svc_123",
    seatLabels: ["A1"],
    reason: "Repair",
  }, "local");

  assert.deepEqual(labels, ["A1"]);
  assert.deepEqual(calls[0], {
    url: "/api/seat-maintenance",
    method: "PUT",
    body: {
      service_id: "svc_123",
      seat_labels: ["A1"],
      reason: "Repair",
    },
  });
});

test("saveResourceMaintenanceSeats diffs platform maintenance create and end calls", async () => {
  setPlatformContextEnv();
  const calls: Array<{ url: string; method?: string; headers: Headers; body: unknown }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined,
    });

    if (String(url).startsWith("/api/v1/resource-maintenance?")) {
      return jsonResponse({
        maintenance: [
          {
            maintenance_id: "maint_1",
            service_id: "svc_123",
            reason: "Old",
            metadata: { resource_label: "A1" },
          },
          {
            maintenance_id: "maint_2",
            service_id: "svc_123",
            reason: "Old",
            metadata: { resource_label: "A2" },
          },
        ],
      });
    }

    return jsonResponse({ maintenance_id: "ok" });
  };

  const labels = await saveResourceMaintenanceSeats({
    serviceId: "svc_123",
    seatLabels: ["A2", "A3"],
    reason: "Repair",
  }, "platform");

  assert.deepEqual(labels, ["A2", "A3"]);
  assert.equal(calls[0]?.url, "/api/v1/resource-maintenance?service_id=svc_123");
  assertPlatformContextHeaders(calls[0]?.headers);
  assert.equal(calls[1]?.url, "/api/v1/resource-maintenance");
  assert.equal(calls[1]?.method, "POST");
  assertPlatformContextHeaders(calls[1]?.headers);
  assert.match(calls[1]?.headers.get("Idempotency-Key") ?? "", /^resource-maintenance-create-svc_123-A2-/);
  assert.deepEqual(calls[1]?.body, {
    service_id: "svc_123",
    reason: "Repair",
    metadata: { resource_label: "A2" },
  });
  assert.equal(calls[2]?.url, "/api/v1/resource-maintenance");
  assert.equal(calls[2]?.method, "POST");
  assertPlatformContextHeaders(calls[2]?.headers);
  assert.match(calls[2]?.headers.get("Idempotency-Key") ?? "", /^resource-maintenance-create-svc_123-A3-/);
  assert.deepEqual(calls[2]?.body, {
    service_id: "svc_123",
    reason: "Repair",
    metadata: { resource_label: "A3" },
  });
  assert.equal(calls[3]?.url, "/api/v1/resource-maintenance/maint_1/end");
  assert.equal(calls[3]?.method, "POST");
  assertPlatformContextHeaders(calls[3]?.headers);
  assert.match(calls[3]?.headers.get("Idempotency-Key") ?? "", /^resource-maintenance-end-maint_1-/);
});

test("createReservationFromBookingForm posts platform reservation input in platform mode", async () => {
  setPlatformContextEnv();
  const calls: Array<{ url: string; headers: Headers; body: unknown }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined,
    });
    return jsonResponse({ reservation_id: "res_123", status: "confirmed" });
  };

  await createReservationFromBookingForm({
    service_id: "svc_123",
    booking_date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    seats_booked: 1,
    selected_seat_labels: ["A1"],
    user_name: "Ada",
    user_email: "ada@example.com",
    user_phone: "555",
    interface_type: "form",
  }, "platform");

  assert.equal(calls[0]?.url, "/api/v1/reservations");
  assertPlatformContextHeaders(calls[0]?.headers);
  assert.match(calls[0]?.headers.get("Idempotency-Key") ?? "", /^reservation-create-/);
  assert.deepEqual(calls[0]?.body, {
    service_id: "svc_123",
    date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    quantity: 1,
    reservation_items: [{ resource_label: "A1", quantity: 1 }],
    customer: {
      name: "Ada",
      email: "ada@example.com",
      phone: "555",
    },
  });
});

test("updateReservationStatus patches the platform reservation endpoint in platform mode", async () => {
  setPlatformContextEnv();
  const calls: Array<{ url: string; method?: string; headers: Headers; body: unknown }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined,
    });
    return jsonResponse({ reservation_id: "res_123", status: "completed" });
  };

  await updateReservationStatus("res_123", "completed", "platform");

  assert.equal(calls[0]?.url, "/api/v1/reservations/res_123");
  assert.equal(calls[0]?.method, "PATCH");
  assertPlatformContextHeaders(calls[0]?.headers);
  assert.match(calls[0]?.headers.get("Idempotency-Key") ?? "", /^reservation-update-res_123-/);
  assert.deepEqual(calls[0]?.body, { status: "completed" });
});

test("listAdminReservations maps platform reservations to admin bookings", async () => {
  const calls: Array<{ url: string; headers: Headers }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) });
    return jsonResponse({
      reservations: [{
        reservation_id: "res_123",
        service_id: "svc_123",
        status: "confirmed",
        date: "2026-01-02",
        start_time: "12:00",
        end_time: "13:00",
        quantity: 2,
        reservation_items: [{ resource_id: "res_1", quantity: 1 }],
        customer: {
          name: "Ada",
          email: "ada@example.com",
          phone: "555",
        },
        metadata: {
          service_name: "Simulator",
        },
      }],
      summary: {
        total: 9,
        confirmed_today: 3,
      },
    });
  };

  const bookings = await listAdminReservations({
    search: "Ada",
    baseUrl: "https://reservations.example.test",
    headers: { cookie: "sb=session" },
  }, "platform");

  assert.equal(calls[0]?.url, "https://reservations.example.test/api/v1/reservations?search=Ada");
  assert.equal(calls[0]?.headers.get("cookie"), "sb=session");
  assert.match(calls[0]?.headers.get("X-Correlation-Id") ?? "", /^frontend-/);
  assert.deepEqual(bookings, [{
    id: "res_123",
    user_name: "Ada",
    user_email: "ada@example.com",
    user_phone: "555",
    booking_date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    seats_booked: 2,
    seat_labels: ["res_1"],
    status: "confirmed",
    services: { name: "Simulator" },
  }]);
  assert.deepEqual(bookings.summary, {
    total: 9,
    confirmed_today: 3,
  });
});

test("listAdminReservations preserves local array behavior without summary", async () => {
  const localBookings = [{
    id: "booking_123",
    user_name: "Ada",
    user_email: "ada@example.com",
    booking_date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    seats_booked: 1,
    status: "confirmed",
    services: null,
  }];
  globalThis.fetch = async () => jsonResponse(localBookings);

  const bookings = await listAdminReservations({}, "local");

  assert.deepEqual(bookings, localBookings);
  assert.equal(bookings.summary, undefined);
});

test("platformReservationToAdminBooking falls back without service metadata", () => {
  assert.deepEqual(platformReservationToAdminBooking({
    reservation_id: "res_123",
    service_id: "svc_123",
    status: "confirmed",
    quantity: 1,
  }), {
    id: "res_123",
    user_name: "Guest",
    user_email: "",
    user_phone: undefined,
    booking_date: "",
    start_time: "",
    end_time: "",
    seats_booked: 1,
    seat_labels: undefined,
    status: "confirmed",
    services: null,
  });
});

test("platform mapping helpers are stable for direct unit use", () => {
  assert.deepEqual(platformServiceToLegacyService({
    service_id: "svc_123",
    name: "Service",
    resource_strategy: "quantity",
    total_quantity: 5,
  }), {
    id: "svc_123",
    name: "Service",
    description: undefined,
    total_seats: 5,
    created_at: "",
    resource_kind: undefined,
    selection_mode: "quantity",
    reservation_policy: undefined,
    resources: undefined,
    layout: undefined,
  });

  assert.deepEqual(platformAvailabilityToLegacyAvailability({ slots: [] }), {
    timeSlots: [],
    totalSeats: undefined,
    resource_kind: undefined,
    selection_mode: undefined,
    reservation_policy: undefined,
    resources: undefined,
    layout: undefined,
  });

  assert.deepEqual(legacyBookingToPlatformInput({
    service_id: "svc_123",
    booking_date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    seats_booked: 1,
    user_name: "Ada",
    user_email: "ada@example.com",
  }), {
    service_id: "svc_123",
    date: "2026-01-02",
    start_time: "12:00",
    end_time: "13:00",
    quantity: 1,
    reservation_items: undefined,
    customer: {
      name: "Ada",
      email: "ada@example.com",
      phone: undefined,
    },
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setPlatformContextEnv() {
  process.env.NEXT_PUBLIC_RESERVATION_TENANT_ID = "tenant_123";
  process.env.NEXT_PUBLIC_RESERVATION_VENUE_ID = "venue_456";
}

function clearReservationEnv() {
  delete process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL;
  delete process.env.NEXT_PUBLIC_RESERVATION_TENANT_ID;
  delete process.env.NEXT_PUBLIC_RESERVATION_VENUE_ID;
}

function restoreReservationEnv() {
  restoreEnvValue("NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL", originalPlatformBaseUrl);
  restoreEnvValue("NEXT_PUBLIC_RESERVATION_TENANT_ID", originalTenantId);
  restoreEnvValue("NEXT_PUBLIC_RESERVATION_VENUE_ID", originalVenueId);
}

function restoreEnvValue(
  key:
    | "NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL"
    | "NEXT_PUBLIC_RESERVATION_TENANT_ID"
    | "NEXT_PUBLIC_RESERVATION_VENUE_ID",
  value: string | undefined,
) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

function assertPlatformContextHeaders(headers: Headers | undefined) {
  assert.ok(headers);
  assert.equal(headers.get("X-Reservation-Tenant-Id"), "tenant_123");
  assert.equal(headers.get("X-Reservation-Venue-Id"), "venue_456");
  assert.match(headers.get("X-Correlation-Id") ?? "", /^frontend-/);
}

function assertNoConfiguredPlatformCompatibilityFallbacks(calls: string[], frontendBaseUrl: string) {
  assert.ok(calls.length > 0);

  for (const requestUrl of calls) {
    assert.ok(
      requestUrl.startsWith("https://reservations.example.test/v1/"),
      `Expected configured platform URL to use standalone backend /v1 origin: ${requestUrl}`,
    );
    assert.ok(
      !requestUrl.startsWith("/api"),
      `Configured platform mode must not fall back to local compatibility routes: ${requestUrl}`,
    );
    assert.ok(
      !requestUrl.startsWith(`${frontendBaseUrl}/api/v1`),
      `Configured platform mode must not fall back to current-frontend /api/v1 routes: ${requestUrl}`,
    );
  }
}
