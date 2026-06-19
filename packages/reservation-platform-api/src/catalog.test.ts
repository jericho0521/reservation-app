import assert from "node:assert/strict";
import test from "node:test";
import {
  handlePlatformCatalogRequest,
  getPlatformResourceLayout,
  getPlatformResource,
  getPlatformService,
  getPlatformVenue,
  listPlatformResources,
  listPlatformServices,
  listPlatformVenues,
  type PlatformCatalogRepository,
} from "./catalog.js";
import type { ListServicesResponse } from "@reservation-platform/contract-types";

function repository(overrides: Partial<PlatformCatalogRepository>): PlatformCatalogRepository {
  return {
    listVenues: async () => ({ data: [] }),
    getVenue: async () => ({ data: null }),
    listServices: async () => ({ data: [] }),
    getService: async () => ({ data: null }),
    listResources: async () => ({ data: [] }),
    getResource: async () => ({ data: null }),
    getResourceLayout: async () => ({ data: null }),
    ...overrides,
  };
}

test("catalog service maps venue list rows into platform responses", async () => {
  const result = await listPlatformVenues(repository({
    listVenues: async () => ({ data: [{ id: "venue_1", name: "Main" }] }),
  }));

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    venues: [{
      venue_id: "venue_1",
      tenant_id: undefined,
      name: "Main",
      timezone: undefined,
      metadata: undefined,
    }],
  });
});

test("catalog request dispatcher routes list requests through repository ports", async () => {
  const result = await handlePlatformCatalogRequest({
    path: "/v1/venues/",
    repository: repository({
      listVenues: async () => ({ data: [{ id: "venue_1", name: "Main" }] }),
    }),
  });

  assert.equal(result?.status, 200);
  assert.deepEqual(result?.body, {
    venues: [{
      venue_id: "venue_1",
      tenant_id: undefined,
      name: "Main",
      timezone: undefined,
      metadata: undefined,
    }],
  });
});

test("catalog request dispatcher decodes ids before repository reads", async () => {
  let observedId: string | undefined;
  const result = await handlePlatformCatalogRequest({
    path: "/v1/services/service%20one",
    repository: repository({
      getService: async (id) => {
        observedId = id;
        return { data: { id, name: "Private room" } };
      },
    }),
  });

  assert.equal(observedId, "service one");
  assert.equal(result?.status, 200);
});

test("catalog request dispatcher forwards resource service_id filters", async () => {
  let observedServiceId: string | null | undefined;
  const result = await handlePlatformCatalogRequest({
    path: "/v1/resources",
    url: "http://platform.local/v1/resources?service_id=svc_1",
    repository: repository({
      listResources: async ({ serviceId } = {}) => {
        observedServiceId = serviceId;
        return { data: [] };
      },
    }),
  });

  assert.equal(observedServiceId, "svc_1");
  assert.equal(result?.status, 200);
  assert.deepEqual(result?.body, { resources: [] });
});

test("catalog request dispatcher returns stable errors for missing repositories", async () => {
  const result = await handlePlatformCatalogRequest({
    path: "/v1/resource-layouts/layout_1",
  });

  assert.equal(result?.status, 503);
  assert.deepEqual(result?.body, {
    error: {
      code: "bad_request",
      message: "Catalog repository is not configured.",
      status: 503,
    },
  });
});

test("catalog request dispatcher ignores non-catalog routes", async () => {
  const result = await handlePlatformCatalogRequest({
    path: "/v1/reservations",
    repository: repository({}),
  });

  assert.equal(result, undefined);
});

test("catalog service maps missing service errors to platform not_found", async () => {
  const result = await getPlatformService(repository({
    getService: async () => ({ data: null, error: { code: "PGRST116" } }),
  }), "svc_missing");

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, {
    error: {
      code: "not_found",
      message: "Service not found.",
      status: 404,
    },
  });
});

test("catalog service maps thrown repository errors to platform internal_error", async () => {
  const result = await getPlatformVenue(repository({
    getVenue: async () => {
      throw new Error("connection reset by storage");
    },
  }), "venue_1");

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, {
    error: {
      code: "internal_error",
      message: "Failed to fetch venue.",
      status: 500,
    },
  });
});

test("catalog service maps returned 500-ish storage errors to platform internal_error", async () => {
  const result = await getPlatformService(repository({
    getService: async () => ({ data: null, error: { status: 500, message: "database unavailable" } }),
  }), "svc_1");

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, {
    error: {
      code: "internal_error",
      message: "Failed to fetch service.",
      status: 500,
    },
  });
});

test("catalog service maps returned storage outage errors to storage_unavailable", async () => {
  const result = await listPlatformResources(repository({
    listResources: async () => ({ data: null, error: { status: 503, message: "pool exhausted" } }),
  }));

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    error: {
      code: "storage_unavailable",
      message: "Failed to fetch resources.",
      status: 503,
    },
  });
});

test("catalog service maps null service reads to platform not_found", async () => {
  const result = await getPlatformService(repository({
    getService: async () => ({ data: null }),
  }), "svc_missing");

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, {
    error: {
      code: "not_found",
      message: "Service not found.",
      status: 404,
    },
  });
});

test("catalog service preserves resource filters through the repository port", async () => {
  let observedServiceId: string | null | undefined;
  const result = await listPlatformResources(repository({
    listResources: async ({ serviceId } = {}) => {
      observedServiceId = serviceId;
      return {
        data: [{
          id: "res_1",
          service_id: serviceId,
          label: "A1",
          kind: "seat",
          is_active: true,
        }],
      };
    },
  }), { serviceId: "svc_1" });

  assert.equal(observedServiceId, "svc_1");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    resources: [{
      resource_id: "res_1",
      service_id: "svc_1",
      label: "A1",
      kind: "seat",
      is_active: true,
      capacity: undefined,
      metadata: undefined,
    }],
  });
});

test("catalog service maps missing resource layouts without throwing", async () => {
  const result = await getPlatformResourceLayout(repository({
    getResourceLayout: async () => ({ data: null }),
  }), "layout_missing");

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, {
    error: {
      code: "not_found",
      message: "Resource layout not found.",
      status: 404,
    },
  });
});

test("catalog service maps resource get rows through platform resource adapter", async () => {
  const result = await getPlatformResource(repository({
    getResource: async () => ({
      data: {
        id: "res_1",
        service_id: "svc_1",
        label: "A1",
        kind: "seat",
        is_active: true,
      },
    }),
  }), "res_1");

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    resource_id: "res_1",
    service_id: "svc_1",
    label: "A1",
    kind: "seat",
    is_active: true,
    capacity: undefined,
    metadata: undefined,
  });
});

test("catalog service maps missing resource errors to platform not_found", async () => {
  const result = await getPlatformResource(repository({
    getResource: async () => ({ data: null, error: { code: "PGRST116" } }),
  }), "res_missing");

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, {
    error: {
      code: "not_found",
      message: "Resource not found.",
      status: 404,
    },
  });
});

test("catalog service maps null resource reads to platform not_found", async () => {
  const result = await getPlatformResource(repository({
    getResource: async () => ({ data: undefined }),
  }), "res_missing");

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, {
    error: {
      code: "not_found",
      message: "Resource not found.",
      status: 404,
    },
  });
});

test("catalog service maps resource layout rows through platform layout adapter", async () => {
  const result = await getPlatformResourceLayout(repository({
    getResourceLayout: async () => ({
      data: {
        id: "layout_1",
        service_id: "svc_1",
        layout_kind: "grid",
        metadata: {
          resources: [{ resource_id: "res_1", label: "A1", row: 1, column: 1 }],
        },
      },
    }),
  }), "layout_1");

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    layout_id: "layout_1",
    service_id: "svc_1",
    kind: "grid",
    resources: [{
      resource_id: "res_1",
      label: "A1",
      row: 1,
      column: 1,
      x: undefined,
      y: undefined,
      width: undefined,
      height: undefined,
      metadata: undefined,
    }],
    metadata: undefined,
  });
});

test("catalog service maps service list rows with resource metadata", async () => {
  const result = await listPlatformServices(repository({
    listServices: async () => ({
      data: [{
        id: "svc_1",
        name: "Movie",
        selection_mode: "assigned_resource",
        resources: [{ id: "seat_a1", label: "A1", kind: "seat" }],
      }],
    }),
  }));

  assert.equal(result.status, 200);
  const body = result.body as ListServicesResponse;
  assert.deepEqual(body.services[0]?.resource_strategy, "assigned_resource");
  assert.deepEqual(body.services[0]?.resources?.[0]?.label, "A1");
});

test("catalog service maps venue get rows through platform venue adapter", async () => {
  const result = await getPlatformVenue(repository({
    getVenue: async () => ({ data: { id: "venue_1", name: "Main" } }),
  }), "venue_1");

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    venue_id: "venue_1",
    tenant_id: undefined,
    name: "Main",
    timezone: undefined,
    metadata: undefined,
  });
});

test("catalog service maps null venue reads to platform not_found", async () => {
  const result = await getPlatformVenue(repository({
    getVenue: async () => ({ data: null }),
  }), "venue_missing");

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, {
    error: {
      code: "not_found",
      message: "Venue not found.",
      status: 404,
    },
  });
});
