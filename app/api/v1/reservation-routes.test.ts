import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { DELETE, PATCH } from "./reservations/[id]/route";
import { POST as cancelReservation } from "./reservations/[id]/cancel/route";
import { POST as rescheduleReservation } from "./reservations/[id]/reschedule/route";
import { POST as endResourceMaintenance } from "./resource-maintenance/[id]/end/route";
import { POST as createReservation } from "./reservations/route";
import { POST as createResourceMaintenance } from "./resource-maintenance/route";
import {
  createLegacyReservationResponse,
  legacyBookingCreateToReservation,
} from "./reservation-create-compatibility";
import { resolveResourceIdsForLegacyReservation } from "./reservation-resource-labels";
import {
  createPlatformServiceBearerAuthPreflight,
  InProcessCompatibilityIdempotencyRepository,
  requirePlatformAuthenticatedSupabase,
  requirePlatformAuthenticatedSupabaseWithTenantContext,
  requirePlatformServiceBearerAuth,
  requireTenantScopedRecordBinding,
  resolveBackendRuntimeIdempotencyRepository,
  runJsonMutationIdempotently,
} from "./route-utils";
import { readLegacyCompatibleReservation } from "./reservation-read-compatibility";
import { listLegacyCompatibleReservations } from "./reservation-list-compatibility";
import { cancelLegacyCompatibleReservation } from "./reservation-cancel-compatibility";
import {
  rescheduleLegacyCompatibleReservation,
  updateLegacyCompatibleReservation,
} from "./reservation-update-compatibility";
import type {
  IdempotencyCommitRecord,
  IdempotencyRecord,
  IdempotencyRepository,
  PlatformTenantVenueRepository,
} from "@reservation-platform/api";
import {
  buildReservationSearchFilterExpression,
  normalizeReservationSearchTerm,
} from "@reservation-platform/api";

class FakeIdempotencyRepository implements IdempotencyRepository {
  records = new Map<string, IdempotencyRecord>();

  claimInProgress(record: IdempotencyRecord) {
    const existing = this.records.get(record.key);
    if (existing) {
      return existing;
    }

    this.records.set(record.key, record);
    return null;
  }

  storeCompleted(record: IdempotencyCommitRecord) {
    this.records.set(record.key, record);
  }
}

const missingIdempotencyBody = {
  error: {
    code: "missing_idempotency_key",
    message: "Missing Idempotency-Key header for mutation.",
    status: 400,
    idempotency: { status: "rejected" },
  },
};

const missingBearerBody = {
  error: {
    code: "unauthorized",
    message: "Missing bearer token.",
    status: 401,
  },
};

const nonBearerBody = {
  error: {
    code: "unauthorized",
    message: "Authorization header must use Bearer authentication.",
    status: 401,
  },
};

const invalidBearerBody = {
  error: {
    code: "unauthorized",
    message: "Invalid bearer token.",
    status: 401,
  },
};

const platformUnauthorizedBody = {
  error: {
    code: "unauthorized",
    message: "Authentication is required.",
    status: 401,
  },
};

function testUserWithReservationClaims({
  tenantIds = ["tenant_123"],
  venueIds = ["venue_123"],
}: {
  tenantIds?: string[];
  venueIds?: string[];
} = {}) {
  return {
    id: "user_123",
    app_metadata: {
      reservation_tenant_ids: tenantIds,
      reservation_venue_ids: venueIds,
    },
  };
}

const routeContext = {
  params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
};

const apiV1Dir = dirname(fileURLToPath(import.meta.url));
const legacyBookingImportPrefix = "@/" + "app/api/bookings";
const legacySeatMaintenanceRouteImport = "@/" + "app/api/seat-maintenance/route";

function readApiV1Source(relativePath: string) {
  return readFileSync(join(apiV1Dir, ...relativePath.split("/")), "utf8");
}

function listApiV1TypeScriptSources(directory = apiV1Dir): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return listApiV1TypeScriptSources(fullPath);
    }

    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

async function freshRouteUtils() {
  return import(`./route-utils?test=${Date.now()}-${Math.random()}`) as Promise<typeof import("./route-utils")>;
}

test("/api/v1 catalog routes use shared platform catalog route glue", () => {
  const catalogRouteFiles = [
    "venues/route.ts",
    "venues/[id]/route.ts",
    "services/route.ts",
    "services/[id]/route.ts",
    "resources/route.ts",
    "resources/[id]/route.ts",
    "resource-layouts/[id]/route.ts",
  ];
  const directServiceCalls = [
    "listPlatformVenues",
    "getPlatformVenue",
    "listPlatformServices",
    "getPlatformService",
    "listPlatformResources",
    "getPlatformResource",
    "getPlatformResourceLayout",
  ];

  for (const routeFile of catalogRouteFiles) {
    const source = readApiV1Source(routeFile);
    assert.match(source, /platformCatalogResponse/, `${routeFile} should use shared catalog route glue`);
    assert.equal(
      source.includes("@reservation-platform/api"),
      false,
      `${routeFile} should not import package services directly`,
    );

    for (const serviceCall of directServiceCalls) {
      assert.equal(
        source.includes(serviceCall),
        false,
        `${routeFile} should not directly call ${serviceCall}`,
      );
    }
  }

  const glueSource = readApiV1Source("catalog-route.ts");
  assert.match(glueSource, /handlePlatformCatalogRequest/);
  assert.match(glueSource, /createPlatformCatalogRepository/);
  assert.match(glueSource, /NextResponse\.json/);
});

test("/api/v1 reservation cancel routes use local cancel compatibility code", () => {
  const routeFiles = [
    "reservations/[id]/route.ts",
    "reservations/[id]/cancel/route.ts",
  ];

  for (const routeFile of routeFiles) {
    const source = readApiV1Source(routeFile);
    assert.equal(
      source.includes(legacyBookingImportPrefix),
      false,
      `${routeFile} should not import legacy booking routes directly`,
    );
    assert.match(
      source,
      /reservation-cancel-compatibility/,
      `${routeFile} should use local reservation cancel compatibility code`,
    );
    assert.match(
      source,
      /cancelLegacyCompatibleReservation/,
      `${routeFile} should call local cancel compatibility execution`,
    );
    assert.equal(
      source.includes("cancelLegacyReservation"),
      false,
      `${routeFile} should not call legacy service cancel delegation`,
    );
  }
});

test("/api/v1 reservation reschedule route uses local update compatibility code", () => {
  const source = readApiV1Source("reservations/[id]/reschedule/route.ts");

  assert.equal(
    source.includes(legacyBookingImportPrefix),
    false,
    "reservations/[id]/reschedule/route.ts should not import legacy booking routes directly",
  );
  assert.match(
    source,
    /reservation-update-compatibility/,
    "reservations/[id]/reschedule/route.ts should use local reservation update compatibility code",
  );
  assert.match(
    source,
    /rescheduleLegacyCompatibleReservation/,
    "reservations/[id]/reschedule/route.ts should call local reschedule compatibility execution",
  );
  assert.equal(
    source.includes("rescheduleLegacyReservation"),
    false,
    "reservations/[id]/reschedule/route.ts should not call legacy service reschedule delegation",
  );
});

test("PATCH /api/v1/reservations/[id] uses local update compatibility code", () => {
  const routeSource = readApiV1Source("reservations/[id]/route.ts");
  const updateCompatibilitySource = readApiV1Source("reservation-update-compatibility.ts");

  assert.match(routeSource, /reservation-update-compatibility/);
  assert.match(routeSource, /updateLegacyCompatibleReservation/);
  assert.equal(
    routeSource.includes("updateLegacyReservation"),
    false,
    "reservations/[id]/route.ts should not call legacy service update delegation",
  );
  assert.equal(
    updateCompatibilitySource.includes(legacyBookingImportPrefix),
    false,
    "reservation-update-compatibility.ts should not import legacy booking routes",
  );
  assert.match(updateCompatibilitySource, /updateReservationWithLegacyPatch/);
  assert.match(updateCompatibilitySource, /rescheduleReservationWithLegacyPatch/);
  assert.match(updateCompatibilitySource, /createSupabaseReservationMutationRepository/);
  assert.equal(
    updateCompatibilitySource.includes('.from("bookings")'),
    false,
    "reservation-update-compatibility.ts should not own the bookings table query",
  );
  assert.equal(
    updateCompatibilitySource.includes(".update(patch)"),
    false,
    "reservation-update-compatibility.ts should not own the bookings update query",
  );
  assert.equal(
    updateCompatibilitySource.includes("updated_at: new Date().toISOString()"),
    false,
    "reservation-update-compatibility.ts should not own updated_at stamping",
  );
  assert.equal(
    updateCompatibilitySource.includes('.eq("id", reservationId)'),
    false,
    "reservation-update-compatibility.ts should not own mutation id filtering",
  );
  assert.equal(
    updateCompatibilitySource.includes(".select()"),
    false,
    "reservation-update-compatibility.ts should not own mutation select shape",
  );
  assert.equal(
    updateCompatibilitySource.includes(".single()"),
    false,
    "reservation-update-compatibility.ts should not own mutation cardinality",
  );
});

test("GET /api/v1/reservations uses local list compatibility code", () => {
  const source = readApiV1Source("reservations/route.ts");
  const listCompatibilitySource = readApiV1Source("reservation-list-compatibility.ts");

  assert.equal(
    source.includes("listLegacyReservations"),
    false,
    "reservations/route.ts should not call the legacy-service list delegation",
  );
  assert.equal(
    source.includes(legacyBookingImportPrefix),
    false,
    "reservations/route.ts should not import legacy booking routes directly",
  );
  assert.match(source, /reservation-list-compatibility/);
  assert.match(source, /listLegacyCompatibleReservations/);
  assert.equal(
    source.includes("toPlatformReservationsResponse"),
    false,
    "reservations/route.ts should not own list DTO mapping",
  );
  assert.match(listCompatibilitySource, /listReservations/);
  assert.equal(
    listCompatibilitySource.includes("normalizeReservationSearchTerm"),
    false,
    "reservation-list-compatibility.ts should not own search normalization",
  );
  assert.match(listCompatibilitySource, /createSupabaseReservationReadRepository/);
  assert.match(
    listCompatibilitySource,
    /requirePlatformAuthenticatedSupabaseWithTenantContext/,
    "reservation-list-compatibility.ts should validate tenant/venue context before storage reads",
  );
  assert.match(
    listCompatibilitySource,
    /requireTenant:\s*true/,
    "reservation-list-compatibility.ts should require tenant context for read/list compatibility",
  );
  assert.equal(
    listCompatibilitySource.includes('.from("bookings")'),
    false,
    "reservation-list-compatibility.ts should not own the bookings table query",
  );
  assert.equal(
    listCompatibilitySource.includes('select("*, services(name)")'),
    false,
    "reservation-list-compatibility.ts should not own the reservation select shape",
  );
  assert.equal(
    listCompatibilitySource.includes('order("booking_date"'),
    false,
    "reservation-list-compatibility.ts should not own reservation ordering",
  );
  assert.equal(
    listCompatibilitySource.includes(".or(searchFilterExpression)"),
    false,
    "reservation-list-compatibility.ts should not own reservation search filtering",
  );
  assert.equal(
    listCompatibilitySource.includes(".limit(limit)"),
    false,
    "reservation-list-compatibility.ts should not own reservation search limiting",
  );
});

test("GET /api/v1/reservations/[id] uses local read compatibility code", () => {
  const routeSource = readApiV1Source("reservations/[id]/route.ts");
  const readCompatibilitySource = readApiV1Source("reservation-read-compatibility.ts");

  assert.match(routeSource, /reservation-read-compatibility/);
  assert.match(routeSource, /readLegacyCompatibleReservation/);
  assert.equal(
    routeSource.includes("const legacyResponse = await readLegacyCompatibleReservation"),
    false,
    "reservations/[id]/route.ts should not own read DTO mapping",
  );
  assert.equal(
    routeSource.includes("readLegacyReservation"),
    false,
    "reservations/[id]/route.ts should not call legacy service read delegation",
  );
  assert.equal(
    readCompatibilitySource.includes(legacyBookingImportPrefix),
    false,
    "reservation-read-compatibility.ts should not import legacy booking routes",
  );
  assert.match(readCompatibilitySource, /createSupabaseReservationReadRepository/);
  assert.match(
    readCompatibilitySource,
    /requirePlatformAuthenticatedSupabaseWithTenantContext/,
    "reservation-read-compatibility.ts should validate tenant/venue context before storage reads",
  );
  assert.match(
    readCompatibilitySource,
    /requireTenant:\s*true/,
    "reservation-read-compatibility.ts should require tenant context for read compatibility",
  );
  assert.equal(
    readCompatibilitySource.includes('.from("bookings")'),
    false,
    "reservation-read-compatibility.ts should not own the bookings table query",
  );
  assert.equal(
    readCompatibilitySource.includes('select("*, services(name)")'),
    false,
    "reservation-read-compatibility.ts should not own the reservation select shape",
  );
  assert.equal(
    readCompatibilitySource.includes(".single()"),
    false,
    "reservation-read-compatibility.ts should not own read cardinality",
  );
  assert.match(readCompatibilitySource, /readReservationById/);
  assert.equal(
    readCompatibilitySource.includes("bookingIdSchema"),
    false,
    "reservation-read-compatibility.ts should not own UUID parsing",
  );
});

test("reservation compatibility files delegate Supabase query shapes to storage package", () => {
  const files = [
    "reservation-list-compatibility.ts",
    "reservation-read-compatibility.ts",
    "reservation-update-compatibility.ts",
    "reservation-cancel-compatibility.ts",
  ];
  const forbiddenFragments = [
    '.from("bookings")',
    'select("*, services(name)")',
    'order("booking_date"',
    ".or(searchFilterExpression)",
    ".limit(limit)",
    ".update(patch)",
    '.eq("id", reservationId)',
    ".select()",
    ".single()",
  ];

  for (const file of files) {
    const source = readApiV1Source(file);

    assert.match(
      source,
      /@project-play\/reservations-supabase/,
      `${file} should wire the Supabase storage adapter package`,
    );

    for (const fragment of forbiddenFragments) {
      assert.equal(
        source.includes(fragment),
        false,
        `${file} should not contain storage query fragment ${fragment}`,
      );
    }
  }
});

test("GET /api/v1/reservations rejects missing tenant before list storage work", async () => {
  let storageTouched = false;
  let tenantRepositoryTouched = false;
  const response = await listLegacyCompatibleReservations(
    new NextRequest("http://localhost/api/v1/reservations"),
    {
      authenticate: async () => ({
        response: null,
        supabase: {} as never,
        user: testUserWithReservationClaims(),
      }),
      tenantVenueRepository: {
        async getTenant() {
          tenantRepositoryTouched = true;
          return { data: { id: "tenant_123" } };
        },
        async getVenue() {
          tenantRepositoryTouched = true;
          return { data: { id: "venue_123", tenant_id: "tenant_123" } };
        },
      },
      repository: {
        async listReservations() {
          storageTouched = true;
          return { data: [] };
        },
      },
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "validation_failed",
      message: "Missing tenant context.",
      status: 400,
      details: { reason: "tenant_required" },
    },
  });
  assert.equal(tenantRepositoryTouched, false);
  assert.equal(storageTouched, false);
});

test("GET /api/v1/reservations validates tenant context before list storage work", async () => {
  let storageTouched = false;
  const response = await listLegacyCompatibleReservations(
    new NextRequest("http://localhost/api/v1/reservations?search=ada", {
      headers: {
        "X-Reservation-Tenant-Id": "tenant_123",
        "X-Reservation-Venue-Id": "venue_123",
      },
    }),
    {
      authenticate: async () => ({
        response: null,
        supabase: {} as never,
        user: testUserWithReservationClaims(),
      }),
      tenantVenueRepository: {
        async getTenant(id) {
          assert.equal(id, "tenant_123");
          return { data: { id } };
        },
        async getVenue(id) {
          assert.equal(id, "venue_123");
          return { data: { id, tenant_id: "tenant_123" } };
        },
      },
      repository: {
        async listReservations(input) {
          storageTouched = true;
          assert.equal(input.search, "ada");
          assert.match(input.searchFilterExpression ?? "", /Ada|ada/i);
          return { data: [] };
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reservations: [] });
  assert.equal(storageTouched, true);
});

test("GET /api/v1/reservations includes optional repository summary", async () => {
  const response = await listLegacyCompatibleReservations(
    new NextRequest("http://localhost/api/v1/reservations", {
      headers: {
        "X-Reservation-Tenant-Id": "tenant_123",
      },
    }),
    {
      authenticate: async () => ({
        response: null,
        supabase: {} as never,
        user: testUserWithReservationClaims(),
      }),
      tenantVenueRepository: {
        async getTenant(id) {
          assert.equal(id, "tenant_123");
          return { data: { id } };
        },
        async getVenue() {
          throw new Error("venue should not be required without venue context");
        },
      },
      repository: {
        async listReservations() {
          return { data: [] };
        },
        async getReservationsSummary() {
          return {
            summary: {
              total: 8,
              confirmed_today: 2,
            },
          };
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    reservations: [],
    summary: {
      total: 8,
      confirmed_today: 2,
    },
  });
});

test("GET /api/v1/reservations/[id] rejects missing tenant before read storage work", async () => {
  let storageTouched = false;
  let tenantRepositoryTouched = false;
  const response = await readLegacyCompatibleReservation(
    new Request("http://localhost/api/v1/reservations/00000000-0000-4000-8000-000000000001"),
    routeContext,
    {
      authenticate: async () => ({
        response: null,
        supabase: {} as never,
        user: testUserWithReservationClaims({ venueIds: ["venue_other"] }),
      }),
      tenantVenueRepository: {
        async getTenant() {
          tenantRepositoryTouched = true;
          return { data: { id: "tenant_123" } };
        },
        async getVenue() {
          tenantRepositoryTouched = true;
          return { data: { id: "venue_123", tenant_id: "tenant_123" } };
        },
      },
      repository: {
        async readReservationById() {
          storageTouched = true;
          return { data: null };
        },
      },
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "validation_failed",
      message: "Missing tenant context.",
      status: 400,
      details: { reason: "tenant_required" },
    },
  });
  assert.equal(tenantRepositoryTouched, false);
  assert.equal(storageTouched, false);
});

test("GET /api/v1/reservations/[id] validates tenant context before read storage work", async () => {
  let storageTouched = false;
  const response = await readLegacyCompatibleReservation(
    new Request("http://localhost/api/v1/reservations/00000000-0000-4000-8000-000000000001", {
      headers: {
        "X-Reservation-Tenant-Id": "tenant_123",
        "X-Reservation-Venue-Id": "venue_123",
      },
    }),
    routeContext,
    {
      authenticate: async () => ({
        response: null,
        supabase: {} as never,
        user: testUserWithReservationClaims(),
      }),
      tenantVenueRepository: {
        async getTenant(id) {
          assert.equal(id, "tenant_123");
          return { data: { id } };
        },
        async getVenue(id) {
          assert.equal(id, "venue_123");
          return { data: { id, tenant_id: "tenant_123" } };
        },
      },
      repository: {
        async readReservationById(reservationId) {
          storageTouched = true;
          assert.equal(reservationId, "00000000-0000-4000-8000-000000000001");
          return {
            data: {
              id: reservationId,
              user_name: "Ada Lovelace",
              user_email: "ada@example.com",
              user_phone: "555-0100",
              booking_date: "2026-06-12",
              start_time: "10:00",
              end_time: "11:00",
              status: "confirmed",
              services: { name: "Simulator" },
            },
          };
        },
      },
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.reservation_id, "00000000-0000-4000-8000-000000000001");
  assert.equal(storageTouched, true);
});

test("GET /api/v1/reservations/[id] maps invalid ids through platform 400", async () => {
  const legacyResponse = await readLegacyCompatibleReservation(
    new Request("http://localhost/api/v1/reservations/not-a-uuid", {
      headers: { "X-Reservation-Tenant-Id": "tenant_123" },
    }),
    { params: Promise.resolve({ id: "not-a-uuid" }) },
    {
      authenticate: async () => ({
        response: null,
        supabase: {} as never,
        user: testUserWithReservationClaims({ venueIds: ["venue_other"] }),
      }),
      tenantVenueRepository: {
        async getTenant(id) {
          assert.equal(id, "tenant_123");
          return { data: { id } };
        },
        async getVenue() {
          throw new Error("venue lookup should not run without venue context");
        },
      },
    },
  );
  const response = legacyResponse;

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, "validation_failed");
  assert.equal(payload.error.message, "Invalid reservation id");
  assert.equal(payload.error.status, 400);
  assert.ok(Array.isArray(payload.error.details));
});

test("PATCH /api/v1/reservations/[id] local compatibility maps invalid ids through platform 400", async () => {
  const legacyResponse = await updateLegacyCompatibleReservation(
    { params: Promise.resolve({ id: "not-a-uuid" }) },
    { user_name: "Ada Lovelace" },
    {
      response: null,
      supabase: {} as never,
      user: { id: "user_123" },
    },
  );
  const response = legacyResponse;

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, "validation_failed");
  assert.equal(payload.error.message, "Invalid reservation update data");
  assert.equal(payload.error.status, 400);
  assert.ok(Array.isArray(payload.error.details));
});

test("reservation cancel local compatibility maps invalid ids through platform 400", async () => {
  const legacyResponse = await cancelLegacyCompatibleReservation(
    { params: Promise.resolve({ id: "not-a-uuid" }) },
    {
      response: null,
      supabase: {} as never,
      user: { id: "user_123" },
    },
  );
  const response = legacyResponse;

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, "validation_failed");
  assert.equal(payload.error.message, "Invalid reservation id");
  assert.equal(payload.error.status, 400);
  assert.ok(Array.isArray(payload.error.details));
});

test("reservation reschedule local compatibility maps invalid ids through platform 400", async () => {
  const legacyResponse = await rescheduleLegacyCompatibleReservation(
    { params: Promise.resolve({ id: "not-a-uuid" }) },
    {
      booking_date: "2026-07-01",
      start_time: "14:00",
      end_time: "15:00",
    },
    {
      response: null,
      supabase: {} as never,
      user: { id: "user_123" },
    },
  );
  const response = legacyResponse;

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, "validation_failed");
  assert.equal(payload.error.message, "Invalid reservation update data");
  assert.equal(payload.error.status, 400);
  assert.ok(Array.isArray(payload.error.details));
});

test("no /api/v1 runtime source imports legacy booking routes", () => {
  const importers = listApiV1TypeScriptSources()
    .filter((sourcePath) => readFileSync(sourcePath, "utf8").includes(legacyBookingImportPrefix))
    .map((sourcePath) => relative(apiV1Dir, sourcePath).split(sep).join("/"))
    .sort();

  assert.deepEqual(importers, []);
});

test("/api/v1 reservation create uses local repository-backed compatibility code", () => {
  const routeSource = readApiV1Source("reservations/route.ts");
  const createCompatibilitySource = readApiV1Source("reservation-create-compatibility.ts");

  assert.equal(
    createCompatibilitySource.includes(legacyBookingImportPrefix),
    false,
    "reservation-create-compatibility.ts should not import legacy booking routes",
  );
  assert.match(routeSource, /createLegacyReservationResponse/);
  assert.equal(
    routeSource.includes("platformResponseFromLegacy"),
    false,
    "reservations/route.ts should not double-map create responses through legacy platform response helpers",
  );
  assert.match(createCompatibilitySource, /createReservation/);
  assert.match(createCompatibilitySource, /createReservationAtomic/);
  assert.match(createCompatibilitySource, /createPlatformReservationRepository/);
});

test("legacy create compatibility converts reservation_items alias before atomic create", async () => {
  const serviceId = "00000000-0000-4000-8000-000000000010";
  const resourceId = "00000000-0000-4000-8000-000000000011";
  const legacyInput = {
    service_id: serviceId,
    user_name: "Ada Lovelace",
    user_email: "ada@example.com",
    user_phone: "555-0100",
    booking_date: "2026-01-02",
    start_time: "10:00",
    end_time: "11:00",
    seats_booked: 2,
    reservation_items: [
      { resource_id: resourceId, resource_label: "RS1", quantity: 2 },
    ],
    interface_type: "form",
  };

  let atomicInput: unknown;
  const response = await createLegacyReservationResponse(legacyInput, () => ({
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
  }));

  assert.equal(response.status, 201);
  assert.deepEqual(atomicInput, {
    reservation: {
      service_id: serviceId,
      customer_name: "Ada Lovelace",
      customer_email: "ada@example.com",
      customer_phone: "555-0100",
      booking_date: "2026-01-02",
      start_time: "10:00",
      end_time: "11:00",
      quantity: 2,
      items: [{ resource_id: resourceId, resource_label: "RS1", quantity: 2 }],
      status: "confirmed",
      interface_type: "form",
      seats_booked: 2,
      seat_labels: ["RS1"],
    },
  });
});

test("legacy create compatibility maps atomic resource conflicts to platform errors", async () => {
  const response = await createLegacyReservationResponse({
    service_id: "00000000-0000-4000-8000-000000000020",
    user_name: "Grace Hopper",
    user_email: "grace@example.com",
    user_phone: "555-0200",
    booking_date: "2026-01-02",
    start_time: "10:00",
    end_time: "11:00",
    seats_booked: 1,
    seat_labels: ["RS2"],
    interface_type: "chat",
  }, () => ({
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
  }));

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      code: "conflict",
      message: "Some selected resources are no longer available",
      status: 409,
      details: {
        resource_labels: ["RS2"],
        seat_labels: ["RS2"],
      },
    },
  });
});

test("normalizeReservationSearchTerm trims blank searches and caps length", () => {
  assert.equal(normalizeReservationSearchTerm("   "), null);
  assert.equal(normalizeReservationSearchTerm("  Alex  "), "Alex");
  assert.equal(normalizeReservationSearchTerm("x".repeat(101)), "x".repeat(100));
});

test("buildReservationSearchFilter quotes reserved PostgREST characters", () => {
  assert.equal(
    buildReservationSearchFilterExpression('Smith, Alex (VIP) "Racer"'),
    'user_name.ilike."%Smith, Alex (VIP) \\"Racer\\"%",user_email.ilike."%Smith, Alex (VIP) \\"Racer\\"%",user_phone.ilike."%Smith, Alex (VIP) \\"Racer\\"%"',
  );
});

test("buildReservationSearchFilter escapes SQL LIKE wildcards", () => {
  assert.equal(
    buildReservationSearchFilterExpression("100%_ready\\now"),
    'user_name.ilike."%100\\\\%\\\\_ready\\\\\\\\now%",user_email.ilike."%100\\\\%\\\\_ready\\\\\\\\now%",user_phone.ilike."%100\\\\%\\\\_ready\\\\\\\\now%"',
  );
});

test("POST /api/v1/reservations maps legacy create validation failures to platform 400", async () => {
  const response = await createReservation(new Request("http://localhost/api/v1/reservations", {
    method: "POST",
    headers: { "Idempotency-Key": "idem_legacy_create_validation_123" },
    body: JSON.stringify({
      service_id: "svc_123",
      date: "2026-07-01",
      start_time: "14:00",
      end_time: "15:00",
      quantity: 1,
      customer: {
        name: "Ada Lovelace",
        email: "ada@example.com",
      },
    }),
  }));

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, "validation_failed");
  assert.equal(payload.error.message, "Invalid reservation data");
  assert.equal(payload.error.status, 400);
  assert.equal(JSON.stringify(payload).includes("Failed to create reservation"), false);
});

test("/api/v1 resource maintenance route delegates lifecycle orchestration to application services", () => {
  const source = readApiV1Source("resource-maintenance/route.ts");
  const endSource = readApiV1Source("resource-maintenance/[id]/end/route.ts");

  assert.equal(
    source.includes(legacySeatMaintenanceRouteImport),
    false,
    "resource-maintenance/route.ts should not import the legacy seat-maintenance route directly",
  );
  assert.match(
    source,
    /createSupabaseResourceMaintenanceRepository/,
    "resource-maintenance/route.ts should use the backend Supabase resource maintenance adapter",
  );
  assert.match(source, /listResourceMaintenance/);
  assert.match(source, /createResourceMaintenance/);
  assert.match(endSource, /endResourceMaintenance/);

  for (const oldRouteOrchestration of [
    "prepareLegacyResourceMaintenanceCreate",
    "validateResolvedResourceMaintenanceResource",
    "classifyRepositoryPlatformError",
    "classifySupabaseLikePlatformError",
    "toPlatformResourceMaintenance",
    "toPlatformResourceMaintenanceResponse",
    "listActiveMaintenance(serviceId)",
    "resolveResource(input)",
    "loadService(",
    "createMaintenance(",
    "endMaintenance(id",
  ]) {
    assert.equal(
      source.includes(oldRouteOrchestration),
      false,
      `resource-maintenance/route.ts should not own ${oldRouteOrchestration} orchestration`,
    );
    assert.equal(
      endSource.includes(oldRouteOrchestration),
      false,
      `resource-maintenance/[id]/end/route.ts should not own ${oldRouteOrchestration} orchestration`,
    );
  }
});

test("no /api/v1 runtime source imports legacy seat maintenance routes", () => {
  const importers = listApiV1TypeScriptSources()
    .filter((sourcePath) => readFileSync(sourcePath, "utf8").includes(legacySeatMaintenanceRouteImport))
    .map((sourcePath) => relative(apiV1Dir, sourcePath).split(sep).join("/"))
    .sort();

  assert.deepEqual(importers, []);
});

test("protected mutation shims use host-auth tenant venue context validation preflight", () => {
  const routeFiles = [
    "reservations/[id]/route.ts",
    "reservations/[id]/cancel/route.ts",
    "reservations/[id]/reschedule/route.ts",
    "resource-maintenance/route.ts",
    "resource-maintenance/[id]/end/route.ts",
  ];

  for (const routeFile of routeFiles) {
    const source = readApiV1Source(routeFile);
    assert.match(
      source,
      /requirePlatformAuthenticatedSupabaseWithTenantContext/,
      `${routeFile} should validate tenant/venue context after current host auth`,
    );
    assert.match(
      source,
      /requireTenant:\s*true/,
      `${routeFile} should require tenant context for protected mutation compatibility`,
    );
  }
});

test("protected reservation mutation shims return platform-shaped unexpected errors", () => {
  const routeFiles = [
    "reservations/[id]/route.ts",
    "reservations/[id]/cancel/route.ts",
    "reservations/[id]/reschedule/route.ts",
  ];

  for (const routeFile of routeFiles) {
    const source = readApiV1Source(routeFile);
    assert.match(
      source,
      /platformJsonError\("internal_error"/,
      `${routeFile} should map unexpected failures to platform errors`,
    );
    assert.equal(
      /catch \(error\)[\s\S]*throw error;/.test(source),
      false,
      `${routeFile} should not rethrow unexpected protected mutation failures`,
    );
  }
});

test("protected mutation shims fail closed until records are tenant scoped", async () => {
  const routeFiles = [
    "reservations/[id]/route.ts",
    "reservations/[id]/cancel/route.ts",
    "reservations/[id]/reschedule/route.ts",
    "resource-maintenance/route.ts",
    "resource-maintenance/[id]/end/route.ts",
  ];

  for (const routeFile of routeFiles) {
    const source = readApiV1Source(routeFile);
    assert.match(
      source,
      /requireTenantScopedRecordBinding/,
      `${routeFile} should fail closed before tenant-scoped record mutation`,
    );
  }

  const response = requireTenantScopedRecordBinding();
  assert.ok(response);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "validation_failed",
      message: "Tenant-scoped record mutation is unavailable until reservation records are bound to tenant context.",
      status: 400,
      details: { reason: "tenant_scoped_record_binding_unavailable" },
    },
  });
});

test("resource maintenance mutation shims return validation errors inside idempotency wrapper", () => {
  const routeFiles = [
    "resource-maintenance/route.ts",
    "resource-maintenance/[id]/end/route.ts",
  ];

  for (const routeFile of routeFiles) {
    const source = readApiV1Source(routeFile);
    assert.match(
      source,
      /safeParse\(body\)/,
      `${routeFile} should validate request bodies without throwing after idempotency claim`,
    );
    assert.equal(
      source.includes(".parse(body)"),
      false,
      `${routeFile} should not throw schema validation after idempotency claim`,
    );
  }
});

test("backend runtime idempotency resolver falls back to in-process storage when service-role config is missing", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    process.env.NODE_ENV = "test";
    const repository = resolveBackendRuntimeIdempotencyRepository();
    assert.ok(repository instanceof InProcessCompatibilityIdempotencyRepository);
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }
  }
});

test("backend runtime idempotency resolver does not fall back to in-process storage in production", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  process.env.NODE_ENV = "production";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const { resolveBackendRuntimeIdempotencyRepository } = await freshRouteUtils();
    assert.throws(
      () => resolveBackendRuntimeIdempotencyRepository(),
      /Missing NEXT_PUBLIC_SUPABASE_URL|Missing SUPABASE_SERVICE_ROLE_KEY/,
    );
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }

  }
});

test("POST /api/v1/reservations rejects missing idempotency key before body parsing", async () => {
  const response = await createReservation(new Request("http://localhost/api/v1/reservations", {
    method: "POST",
    body: "{not json",
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), missingIdempotencyBody);
});

test("JSON idempotent mutation helper commits successful mutation responses", async () => {
  const repository = new FakeIdempotencyRepository();
  const response = await runJsonMutationIdempotently({
    repository,
    request: new Request("http://localhost/api/v1/test-mutation", {
      method: "POST",
      headers: { "Idempotency-Key": "idem_commit_123" },
      body: JSON.stringify({ b: 2, a: 1 }),
    }),
    mutate() {
      return Response.json({ reservation_id: "res_123" }, { status: 201 });
    },
  });

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { reservation_id: "res_123" });
  assert.deepEqual(repository.records.get("idem_commit_123"), {
    key: "idem_commit_123",
    method: "POST",
    path: "/api/v1/test-mutation",
    fingerprint: "{\"a\":1,\"b\":2}",
    status: "completed",
    response: {
      status: 201,
      body: { reservation_id: "res_123" },
    },
  });
});

test("JSON idempotent mutation helper replays with an injected fake repository without executing mutation callback", async () => {
  const repository = new FakeIdempotencyRepository();
  let executionCount = 0;
  const requestBody = { service_id: "svc_123", quantity: 2 };

  await runJsonMutationIdempotently({
    repository,
    request: new Request("http://localhost/api/v1/test-mutation", {
      method: "POST",
      headers: { "Idempotency-Key": "idem_replay_123" },
      body: JSON.stringify(requestBody),
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ reservation_id: "res_123" }, { status: 201 });
    },
  });

  const replay = await runJsonMutationIdempotently({
    repository,
    request: new Request("http://localhost/api/v1/test-mutation", {
      method: "POST",
      headers: { "Idempotency-Key": "idem_replay_123" },
      body: JSON.stringify({ quantity: 2, service_id: "svc_123" }),
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ reservation_id: "res_456" }, { status: 201 });
    },
  });

  assert.equal(executionCount, 1);
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), { reservation_id: "res_123" });
});

test("JSON idempotent mutation helper replays deterministic client errors", async () => {
  const repository = new FakeIdempotencyRepository();
  let executionCount = 0;
  const requestBody = { service_id: "svc_123" };

  const first = await runJsonMutationIdempotently({
    repository,
    request: new Request("http://localhost/api/v1/test-mutation", {
      method: "POST",
      headers: { "Idempotency-Key": "idem_validation_replay_123" },
      body: JSON.stringify(requestBody),
    }),
    mutate() {
      executionCount += 1;
      return Response.json({
        error: {
          code: "validation_failed",
          message: "Invalid booking data",
          status: 400,
        },
      }, { status: 400 });
    },
  });

  const replay = await runJsonMutationIdempotently({
    repository,
    request: new Request("http://localhost/api/v1/test-mutation", {
      method: "POST",
      headers: { "Idempotency-Key": "idem_validation_replay_123" },
      body: JSON.stringify(requestBody),
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ ok: true });
    },
  });

  assert.equal(executionCount, 1);
  assert.equal(first.status, 400);
  assert.equal(replay.status, 400);
  assert.deepEqual(await replay.json(), {
    error: {
      code: "validation_failed",
      message: "Invalid booking data",
      status: 400,
    },
  });
});

test("JSON idempotent mutation helper rejects same key with a different body", async () => {
  const repository = new FakeIdempotencyRepository();
  let executionCount = 0;

  await runJsonMutationIdempotently({
    repository,
    request: new Request("http://localhost/api/v1/test-mutation", {
      method: "POST",
      headers: { "Idempotency-Key": "idem_misuse_123" },
      body: JSON.stringify({ service_id: "svc_123", quantity: 2 }),
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ reservation_id: "res_123" }, { status: 201 });
    },
  });

  const misuse = await runJsonMutationIdempotently({
    repository,
    request: new Request("http://localhost/api/v1/test-mutation", {
      method: "POST",
      headers: { "Idempotency-Key": "idem_misuse_123" },
      body: JSON.stringify({ service_id: "svc_123", quantity: 3 }),
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ reservation_id: "res_456" }, { status: 201 });
    },
  });

  assert.equal(executionCount, 1);
  assert.equal(misuse.status, 409);
  assert.equal((await misuse.json()).error.code, "idempotency_key_reused_with_different_request");
});

test("PATCH /api/v1/reservations/[id] rejects missing idempotency key before body parsing", async () => {
  const response = await PATCH(new Request("http://localhost/api/v1/reservations/res_123", {
    method: "PATCH",
    body: "{not json",
  }), routeContext);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), missingIdempotencyBody);
});

test("DELETE /api/v1/reservations/[id] rejects missing idempotency key before body parsing", async () => {
  const response = await DELETE(new Request("http://localhost/api/v1/reservations/res_123", {
    method: "DELETE",
    body: "{not json",
  }), routeContext);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), missingIdempotencyBody);
});

test("POST /api/v1/reservations/[id]/cancel rejects missing idempotency key before body parsing", async () => {
  const response = await cancelReservation(new Request("http://localhost/api/v1/reservations/res_123/cancel", {
    method: "POST",
    body: "{not json",
  }), routeContext);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), missingIdempotencyBody);
});

test("POST /api/v1/reservations/[id]/reschedule rejects missing idempotency key before body parsing", async () => {
  const response = await rescheduleReservation(new Request("http://localhost/api/v1/reservations/res_123/reschedule", {
    method: "POST",
    body: "{not json",
  }), routeContext);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), missingIdempotencyBody);
});

test("legacy reservation resource id resolver skips lookup when service id is missing", async () => {
  const input = {
    resource_ids: ["resource-1"],
    reservation_items: [{ resource_id: "resource-2", quantity: 1 }],
  };
  let repositoryCreated = false;

  const result = await resolveResourceIdsForLegacyReservation(input, () => {
    repositoryCreated = true;
    return {
      async resolveLabelsById() {
        throw new Error("lookup should not run without a service id");
      },
    };
  });

  assert.equal(result, input);
  assert.equal(repositoryCreated, false);
});

test("POST /api/v1/resource-maintenance/[id]/end rejects missing idempotency key before auth and body parsing", async () => {
  const response = await endResourceMaintenance(new Request("http://localhost/api/v1/resource-maintenance/maint_123/end", {
    method: "POST",
    body: "{not json",
  }), routeContext);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), missingIdempotencyBody);
});

test("POST /api/v1/resource-maintenance rejects missing idempotency key before auth and body parsing", async () => {
  const response = await createResourceMaintenance(new Request("http://localhost/api/v1/resource-maintenance", {
    method: "POST",
    body: "{not json",
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), missingIdempotencyBody);
});

test("JSON idempotent mutation helper runs preflight before parsing protected mutation bodies", async () => {
  const repository = new FakeIdempotencyRepository();
  let executionCount = 0;

  const response = await runJsonMutationIdempotently({
    repository,
    request: new Request("http://localhost/api/v1/test-mutation", {
      method: "POST",
      headers: { "Idempotency-Key": "idem_preflight_123" },
      body: "{not json",
    }),
    beforeIdempotency() {
      return Response.json({ error: "Admin authentication required" }, { status: 401 });
    },
    mutate() {
      executionCount += 1;
      return Response.json({ ok: true });
    },
  });

  assert.equal(executionCount, 0);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Admin authentication required" });
  assert.equal(repository.records.size, 0);
});

test("shared protected-route Supabase auth preflight runs before parsing mutation bodies", async () => {
  const repository = new FakeIdempotencyRepository();
  let executionCount = 0;

  const response = await runJsonMutationIdempotently({
    repository,
    request: new Request("http://localhost/api/v1/protected-test-mutation", {
      method: "POST",
      headers: { "Idempotency-Key": "idem_platform_auth_preflight_123" },
      body: "{not json",
    }),
    beforeIdempotency: () => requirePlatformAuthenticatedSupabase({
      authenticate: async () => ({
        response: Response.json({ error: "Admin authentication required" }, { status: 401 }),
        supabase: {} as never,
        user: null,
      }),
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ ok: true });
    },
  });

  assert.equal(executionCount, 0);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), platformUnauthorizedBody);
  assert.equal(repository.records.size, 0);
});

test("tenant venue preflight is not touched when idempotency key is missing", async () => {
  const repository = new FakeIdempotencyRepository();
  let authTouched = false;
  let tenantRepositoryTouched = false;
  let executionCount = 0;
  const request = new Request("http://localhost/api/v1/protected-test-mutation", {
    method: "POST",
    headers: {
      "X-Reservation-Tenant-Id": "tenant_123",
      "X-Reservation-Venue-Id": "venue_123",
    },
    body: "{not json",
  });

  const tenantVenueRepository: PlatformTenantVenueRepository = {
    async getTenant() {
      tenantRepositoryTouched = true;
      return { data: { id: "tenant_123" } };
    },
    async getVenue() {
      tenantRepositoryTouched = true;
      return { data: { id: "venue_123", tenant_id: "tenant_123" } };
    },
  };

  const response = await runJsonMutationIdempotently({
    repository,
    request,
    beforeIdempotency: () => requirePlatformAuthenticatedSupabaseWithTenantContext(request, {
      requireTenant: true,
      repository: tenantVenueRepository,
      authenticate: async () => {
        authTouched = true;
        return {
          response: null,
          supabase: {} as never,
          user: { id: "user_123" },
        };
      },
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ ok: true });
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), missingIdempotencyBody);
  assert.equal(authTouched, false);
  assert.equal(tenantRepositoryTouched, false);
  assert.equal(executionCount, 0);
  assert.equal(repository.records.size, 0);
});

test("authenticated tenant preflight rejects missing tenant before parsing protected mutation bodies", async () => {
  const repository = new FakeIdempotencyRepository();
  let tenantRepositoryTouched = false;
  let executionCount = 0;
  const request = new Request("http://localhost/api/v1/protected-test-mutation", {
    method: "POST",
    headers: { "Idempotency-Key": "idem_tenant_missing_123" },
    body: "{not json",
  });

  const response = await runJsonMutationIdempotently({
    repository,
    request,
    beforeIdempotency: () => requirePlatformAuthenticatedSupabaseWithTenantContext(request, {
      requireTenant: true,
      repository: {
        async getTenant() {
          tenantRepositoryTouched = true;
          return { data: { id: "tenant_123" } };
        },
        async getVenue() {
          tenantRepositoryTouched = true;
          return { data: { id: "venue_123", tenant_id: "tenant_123" } };
        },
      },
      authenticate: async () => ({
        response: null,
        supabase: {} as never,
        user: testUserWithReservationClaims({
          tenantIds: ["tenant_123"],
          venueIds: ["venue_other"],
        }),
      }),
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ ok: true });
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "validation_failed",
      message: "Missing tenant context.",
      status: 400,
      details: { reason: "tenant_required" },
    },
  });
  assert.equal(tenantRepositoryTouched, false);
  assert.equal(executionCount, 0);
  assert.equal(repository.records.size, 0);
});

test("tenant venue preflight rejects venue mismatches before parsing or mutation", async () => {
  const repository = new FakeIdempotencyRepository();
  let executionCount = 0;
  const request = new Request("http://localhost/api/v1/protected-test-mutation", {
    method: "PATCH",
    headers: {
      "Idempotency-Key": "idem_tenant_mismatch_123",
      "X-Reservation-Tenant-Id": "tenant_123",
      "X-Reservation-Venue-Id": "venue_other",
    },
    body: "{not json",
  });

  const response = await runJsonMutationIdempotently({
    repository,
    request,
    beforeIdempotency: () => requirePlatformAuthenticatedSupabaseWithTenantContext(request, {
      requireTenant: true,
      repository: {
        async getTenant() {
          return { data: { id: "tenant_123" } };
        },
        async getVenue() {
          return { data: { id: "venue_other", tenant_id: "tenant_other" } };
        },
      },
      authenticate: async () => ({
        response: null,
        supabase: {} as never,
        user: testUserWithReservationClaims({ venueIds: ["venue_other"] }),
      }),
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ ok: true });
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: {
      code: "forbidden",
      message: "Venue does not belong to the requested tenant.",
      status: 403,
      details: {
        reason: "venue_tenant_mismatch",
        tenant_id: "tenant_123",
        venue_id: "venue_other",
      },
    },
  });
  assert.equal(executionCount, 0);
  assert.equal(repository.records.size, 0);
});

test("tenant venue preflight rejects tenant claims before storage validation", async () => {
  const repository = new FakeIdempotencyRepository();
  let tenantRepositoryTouched = false;
  let executionCount = 0;
  const request = new Request("http://localhost/api/v1/protected-test-mutation", {
    method: "POST",
    headers: {
      "Idempotency-Key": "idem_tenant_claim_mismatch_123",
      "X-Reservation-Tenant-Id": "tenant_123",
      "X-Reservation-Venue-Id": "venue_123",
    },
    body: "{not json",
  });

  const response = await runJsonMutationIdempotently({
    repository,
    request,
    beforeIdempotency: () => requirePlatformAuthenticatedSupabaseWithTenantContext(request, {
      requireTenant: true,
      repository: {
        async getTenant() {
          tenantRepositoryTouched = true;
          return { data: { id: "tenant_123" } };
        },
        async getVenue() {
          tenantRepositoryTouched = true;
          return { data: { id: "venue_123", tenant_id: "tenant_123" } };
        },
      },
      authenticate: async () => ({
        response: null,
        supabase: {} as never,
        user: {
          id: "user_123",
          app_metadata: {
            reservation_tenant_ids: ["tenant_other"],
            reservation_venue_ids: ["venue_123"],
          },
        },
      }),
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ ok: true });
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: {
      code: "forbidden",
      message: "Authenticated user is not authorized for the requested tenant.",
      status: 403,
      details: { reason: "tenant_not_authorized" },
    },
  });
  assert.equal(tenantRepositoryTouched, false);
  assert.equal(executionCount, 0);
  assert.equal(repository.records.size, 0);
});

test("tenant venue preflight rejects venue claims before storage validation", async () => {
  const repository = new FakeIdempotencyRepository();
  let tenantRepositoryTouched = false;
  let executionCount = 0;
  const request = new Request("http://localhost/api/v1/protected-test-mutation", {
    method: "POST",
    headers: {
      "Idempotency-Key": "idem_venue_claim_mismatch_123",
      "X-Reservation-Tenant-Id": "tenant_123",
      "X-Reservation-Venue-Id": "venue_123",
    },
    body: "{not json",
  });

  const response = await runJsonMutationIdempotently({
    repository,
    request,
    beforeIdempotency: () => requirePlatformAuthenticatedSupabaseWithTenantContext(request, {
      requireTenant: true,
      repository: {
        async getTenant() {
          tenantRepositoryTouched = true;
          return { data: { id: "tenant_123" } };
        },
        async getVenue() {
          tenantRepositoryTouched = true;
          return { data: { id: "venue_123", tenant_id: "tenant_123" } };
        },
      },
      authenticate: async () => ({
        response: null,
        supabase: {} as never,
        user: {
          id: "user_123",
          app_metadata: {
            reservation_tenant_ids: ["tenant_123"],
            reservation_venue_ids: ["venue_other"],
          },
        },
      }),
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ ok: true });
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: {
      code: "forbidden",
      message: "Authenticated user is not authorized for the requested venue.",
      status: 403,
      details: { reason: "venue_not_authorized" },
    },
  });
  assert.equal(tenantRepositoryTouched, false);
  assert.equal(executionCount, 0);
  assert.equal(repository.records.size, 0);
});

test("tenant venue preflight allows tenant-level claims without venue restrictions", async () => {
  const repository = new FakeIdempotencyRepository();
  let tenantRepositoryTouched = false;
  let executionCount = 0;
  const request = new Request("http://localhost/api/v1/protected-test-mutation", {
    method: "POST",
    headers: {
      "Idempotency-Key": "idem_tenant_level_venue_123",
      "X-Reservation-Tenant-Id": "tenant_123",
      "X-Reservation-Venue-Id": "venue_123",
    },
    body: JSON.stringify({ ok: true }),
  });

  const response = await runJsonMutationIdempotently({
    repository,
    request,
    beforeIdempotency: () => requirePlatformAuthenticatedSupabaseWithTenantContext(request, {
      requireTenant: true,
      repository: {
        async getTenant() {
          tenantRepositoryTouched = true;
          return { data: { id: "tenant_123" } };
        },
        async getVenue() {
          tenantRepositoryTouched = true;
          return { data: { id: "venue_123", tenant_id: "tenant_123" } };
        },
      },
      authenticate: async () => ({
        response: null,
        supabase: {} as never,
        user: testUserWithReservationClaims({ venueIds: [] }),
      }),
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ ok: true });
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(tenantRepositoryTouched, true);
  assert.equal(executionCount, 1);
  assert.equal(repository.records.size, 1);
});

test("tenant venue preflight lets successful protected mutations keep the original auth context", async () => {
  const repository = new FakeIdempotencyRepository();
  const authContext = {
    response: null,
    supabase: { marker: "supabase" } as never,
    user: {
      id: "user_123",
      app_metadata: {
        reservation_tenant_ids: ["tenant_123"],
        reservation_venue_ids: ["venue_123"],
      },
    },
  };
  let executionCount = 0;
  let receivedAuthContext: unknown;
  const request = new Request("http://localhost/api/v1/protected-test-mutation", {
    method: "POST",
    headers: {
      "Idempotency-Key": "idem_tenant_success_123",
      "X-Reservation-Tenant-Id": "tenant_123",
      "X-Reservation-Venue-Id": "venue_123",
    },
    body: JSON.stringify({ ok: true }),
  });

  const response = await runJsonMutationIdempotently({
    repository,
    request,
    beforeIdempotency: () => requirePlatformAuthenticatedSupabaseWithTenantContext(request, {
      requireTenant: true,
      repository: {
        async getTenant(id) {
          assert.equal(id, "tenant_123");
          return { data: { id } };
        },
        async getVenue(id) {
          assert.equal(id, "venue_123");
          return { data: { id, tenant_id: "tenant_123" } };
        },
      },
      authenticate: async () => authContext,
    }),
    mutate(_body, auth) {
      executionCount += 1;
      receivedAuthContext = auth;
      return Response.json({ ok: true });
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(executionCount, 1);
  assert.equal(receivedAuthContext, authContext);
  assert.equal(repository.records.size, 1);
});

test("tenant venue storage validation errors are internal and non-leaking", async () => {
  const repository = new FakeIdempotencyRepository();
  let executionCount = 0;
  const request = new Request("http://localhost/api/v1/protected-test-mutation", {
    method: "POST",
    headers: {
      "Idempotency-Key": "idem_tenant_storage_error_123",
      "X-Reservation-Tenant-Id": "tenant_123",
    },
    body: "{not json",
  });

  const response = await runJsonMutationIdempotently({
    repository,
    request,
    beforeIdempotency: () => requirePlatformAuthenticatedSupabaseWithTenantContext(request, {
      requireTenant: true,
      repository: {
        async getTenant() {
          throw new Error("database password for tenant_123 leaked");
        },
        async getVenue() {
          throw new Error("lookup should not reach venue validation");
        },
      },
      authenticate: async () => ({
        response: null,
        supabase: {} as never,
        user: testUserWithReservationClaims({ venueIds: [] }),
      }),
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ ok: true });
    },
  });

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: {
      code: "internal_error",
      message: "Failed to validate tenant context.",
      status: 500,
      details: { reason: "tenant_validation_failed" },
    },
  });
  assert.equal(JSON.stringify(payload).includes("database password"), false);
  assert.equal(JSON.stringify(payload).includes("tenant_123 leaked"), false);
  assert.equal(executionCount, 0);
  assert.equal(repository.records.size, 0);
});

test("service bearer auth preflight rejects missing bearer before body parsing or mutation execution", async () => {
  const repository = new FakeIdempotencyRepository();
  let executionCount = 0;
  const request = new Request("http://localhost/api/v1/test-mutation", {
    method: "POST",
    headers: { "Idempotency-Key": "idem_auth_missing_123" },
    body: "{not json",
  });

  const response = await runJsonMutationIdempotently({
    repository,
    request,
    beforeIdempotency: createPlatformServiceBearerAuthPreflight(request, {
      serviceApiKey: "expected-service-token",
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ ok: true });
    },
  });

  assert.equal(executionCount, 0);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), missingBearerBody);
  assert.equal(repository.records.size, 0);
});

test("service bearer auth preflight rejects non-bearer authorization before body parsing or mutation execution", async () => {
  const repository = new FakeIdempotencyRepository();
  let executionCount = 0;
  const request = new Request("http://localhost/api/v1/test-mutation", {
    method: "POST",
    headers: {
      Authorization: "Basic abc123",
      "Idempotency-Key": "idem_auth_non_bearer_123",
    },
    body: "{not json",
  });

  const response = await runJsonMutationIdempotently({
    repository,
    request,
    beforeIdempotency: createPlatformServiceBearerAuthPreflight(request, {
      serviceApiKey: "expected-service-token",
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ ok: true });
    },
  });

  assert.equal(executionCount, 0);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), nonBearerBody);
  assert.equal(repository.records.size, 0);
});

test("service bearer auth preflight rejects wrong bearer before body parsing or mutation execution", async () => {
  const repository = new FakeIdempotencyRepository();
  let executionCount = 0;
  const request = new Request("http://localhost/api/v1/test-mutation", {
    method: "POST",
    headers: {
      Authorization: "Bearer wrong-service-token",
      "Idempotency-Key": "idem_auth_wrong_123",
    },
    body: "{not json",
  });

  const response = await runJsonMutationIdempotently({
    repository,
    request,
    beforeIdempotency: createPlatformServiceBearerAuthPreflight(request, {
      serviceApiKey: "expected-service-token",
    }),
    mutate() {
      executionCount += 1;
      return Response.json({ ok: true });
    },
  });

  assert.equal(executionCount, 0);
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.deepEqual(payload, invalidBearerBody);
  assert.equal(JSON.stringify(payload).includes("expected-service-token"), false);
  assert.equal(JSON.stringify(payload).includes("RESERVATION_PLATFORM_SERVICE_API_KEY"), false);
  assert.equal(repository.records.size, 0);
});

test("service bearer auth fails closed without backend service API key", async () => {
  const response = requirePlatformServiceBearerAuth(
    new Request("http://localhost/api/v1/test-mutation", {
      headers: { Authorization: "Bearer presented-service-token" },
    }),
    { env: { NODE_ENV: "production" } as NodeJS.ProcessEnv },
  );

  assert.ok(response);
  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: {
      code: "internal_error",
      message: "Reservation platform service authentication is unavailable.",
      status: 500,
    },
  });
  assert.equal(JSON.stringify(payload).includes("RESERVATION_PLATFORM_SERVICE_API_KEY"), false);
  assert.equal(JSON.stringify(payload).includes("presented-service-token"), false);
});
