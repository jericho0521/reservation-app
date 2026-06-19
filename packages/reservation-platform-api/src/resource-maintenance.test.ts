import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  classifyRepositoryPlatformError,
  createResourceMaintenance,
  createLegacyResourceMaintenanceRow,
  endResourceMaintenance,
  isResourceMaintenanceSupportedService,
  listResourceMaintenance,
  normalizeMaintenanceResourceLabels,
  prepareLegacyResourceMaintenanceCreate,
} from "./resource-maintenance.js";

const sourceDir = dirname(fileURLToPath(import.meta.url));

test("resource maintenance supports assigned-resource services", () => {
  assert.equal(isResourceMaintenanceSupportedService({
    total_seats: 4,
    selection_mode: "assigned_resource",
  }), true);

  const prepared = prepareLegacyResourceMaintenanceCreate(
    {
      service_id: "svc_assigned",
      reason: "Deep clean",
      metadata: {
        resource_label: "Station 2",
      },
    },
    {
      serviceId: "svc_assigned",
      label: "Station 2",
    },
    {
      total_seats: 4,
      selection_mode: "assigned_resource",
      resources: [
        { label: "Station 1", is_active: true },
        { label: "Station 2", is_active: true },
      ],
    },
    "user_123",
  );

  assert.deepEqual(prepared, {
    status: 200,
    serviceId: "svc_assigned",
    resourceLabel: "Station 2",
    row: {
      service_id: "svc_assigned",
      seat_label: "Station 2",
      reason: "Deep clean",
      is_active: true,
      created_by: "user_123",
    },
  });
});

test("resource maintenance preserves legacy racing simulator label normalization", () => {
  assert.deepEqual(normalizeMaintenanceResourceLabels(["rs 02"], {
    total_seats: 16,
  }), {
    labels: ["RS2"],
    isValid: true,
  });

  const prepared = prepareLegacyResourceMaintenanceCreate(
    {
      service_id: "svc_rs",
      metadata: {
        resource_label: "rs 02",
      },
    },
    {
      serviceId: "svc_rs",
      label: "rs 02",
    },
    {
      total_seats: 16,
    },
  );

  assert.equal(prepared.status, 200);
  assert.equal("row" in prepared ? prepared.row.seat_label : null, "RS2");
});

test("resource maintenance rejects unsupported services", () => {
  assert.deepEqual(prepareLegacyResourceMaintenanceCreate(
    {
      service_id: "svc_quantity",
      metadata: {
        resource_label: "A1",
      },
    },
    {
      serviceId: "svc_quantity",
      label: "A1",
    },
    {
      total_seats: 4,
      selection_mode: "quantity",
      resources: [],
    },
  ), {
    status: 400,
    body: {
      error: {
        code: "validation_failed",
        message: "Resource maintenance is only available for assigned-resource services.",
        status: 400,
      },
    },
  });
});

test("resource maintenance rejects labels outside configured service resources", () => {
  assert.deepEqual(prepareLegacyResourceMaintenanceCreate(
    {
      service_id: "svc_resources",
      metadata: {
        resource_label: "B1",
      },
    },
    {
      serviceId: "svc_resources",
      label: "B1",
    },
    {
      total_seats: 4,
      selection_mode: "assigned_resource",
      resources: [
        { label: "A1", is_active: true },
        { label: "A2", is_active: true },
      ],
    },
  ), {
    status: 400,
    body: {
      error: {
        code: "validation_failed",
        message: "Invalid resource label.",
        status: 400,
      },
    },
  });
});

test("legacy resource maintenance row construction uses public input and authenticated user id", () => {
  assert.deepEqual(createLegacyResourceMaintenanceRow({
    service_id: "svc_123",
    reason: "Repair",
    metadata: {
      resource_label: "A1",
    },
  }, "user_123"), {
    service_id: "svc_123",
    seat_label: "A1",
    reason: "Repair",
    is_active: true,
    created_by: "user_123",
  });

  assert.deepEqual(createLegacyResourceMaintenanceRow({
    service_id: "svc_123",
    resource_id: "res_123",
  }), {
    service_id: "svc_123",
    seat_label: "res_123",
    reason: null,
    is_active: true,
    created_by: null,
  });
});

test("repository errors classify to platform error body and status", () => {
  assert.deepEqual(classifyRepositoryPlatformError(
    { code: "42501", message: "permission denied" },
    "Failed to create resource maintenance.",
  ), {
    status: 403,
    body: {
      error: {
        code: "forbidden",
        message: "Failed to create resource maintenance.",
        status: 403,
        details: { code: "42501" },
      },
    },
  });

  assert.deepEqual(classifyRepositoryPlatformError(
    { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    "Invalid resource maintenance data.",
  ), {
    status: 404,
    body: {
      error: {
        code: "not_found",
        message: "Invalid resource maintenance data.",
        status: 404,
        details: { code: "PGRST116" },
      },
    },
  });

  assert.deepEqual(classifyRepositoryPlatformError(
    { status: 401, message: "JWT expired" },
    "Invalid resource maintenance data.",
  ), {
    status: 401,
    body: {
      error: {
        code: "unauthorized",
        message: "Invalid resource maintenance data.",
        status: 401,
        details: { status: 401 },
      },
    },
  });
});

test("resource maintenance application service lists active rows as platform DTOs", async () => {
  const result = await listResourceMaintenance({
    serviceId: "svc_123",
    repository: {
      async listActiveMaintenance(serviceId) {
        assert.equal(serviceId, "svc_123");
        return {
          data: [{
            id: "maint_123",
            service_id: serviceId,
            seat_label: "A1",
            reason: "Repair",
          }],
        };
      },
    },
  });

  assert.deepEqual(result, {
    status: 200,
    body: {
      maintenance: [{
        maintenance_id: "maint_123",
        resource_id: undefined,
        service_id: "svc_123",
        starts_at: undefined,
        ends_at: undefined,
        reason: "Repair",
        metadata: {
          resource_label: "A1",
        },
      }],
    },
  });
});

test("resource maintenance application service preserves empty list behavior", async () => {
  const result = await listResourceMaintenance({
    serviceId: "svc_empty",
    repository: {
      async listActiveMaintenance() {
        return { data: null };
      },
    },
  });

  assert.deepEqual(result, {
    status: 200,
    body: { maintenance: [] },
  });
});

test("resource maintenance application service maps thrown list failures to stable platform errors", async () => {
  const result = await listResourceMaintenance({
    serviceId: "svc_123",
    repository: {
      async listActiveMaintenance() {
        throw new Error("database connection reset");
      },
    },
  });

  assert.deepEqual(result, {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "Failed to load resource maintenance.",
        status: 500,
      },
    },
  });
});

test("resource maintenance application service creates through repository port", async () => {
  const calls: unknown[] = [];
  const result = await createResourceMaintenance({
    data: {
      service_id: "svc_123",
      resource_id: "res_123",
      reason: "Diagnostics",
    },
    userId: "user_123",
    repository: {
      async resolveResource(input) {
        calls.push(["resolveResource", input]);
        return { serviceId: "svc_123", label: "Station 1" };
      },
      async loadService(serviceId) {
        calls.push(["loadService", serviceId]);
        return {
          data: {
            total_seats: 2,
            selection_mode: "assigned_resource",
            resources: [{ label: "Station 1", is_active: true }],
          },
        };
      },
      async createMaintenance(row) {
        calls.push(["createMaintenance", row]);
        return {
          data: {
            id: "maint_123",
            service_id: row.service_id,
            seat_label: row.seat_label,
            reason: row.reason,
          },
        };
      },
    },
  });

  assert.equal(result.status, 201);
  assert.deepEqual(result.body, {
    maintenance_id: "maint_123",
    resource_id: undefined,
    service_id: "svc_123",
    starts_at: undefined,
    ends_at: undefined,
    reason: "Diagnostics",
    metadata: {
      resource_label: "Station 1",
    },
  });
  assert.deepEqual(calls[2], ["createMaintenance", {
    service_id: "svc_123",
    seat_label: "Station 1",
    reason: "Diagnostics",
    is_active: true,
    created_by: "user_123",
  }]);
});

test("resource maintenance application service classifies end misses", async () => {
  const result = await endResourceMaintenance({
    maintenanceId: "missing_123",
    data: { reason: "Done" },
    repository: {
      async endMaintenance(id, input) {
        assert.equal(id, "missing_123");
        assert.deepEqual(input, { reason: "Done" });
        return {
          data: null,
          error: {
            code: "PGRST116",
            message: "JSON object requested, multiple (or no) rows returned",
          },
        };
      },
    },
  });

  assert.equal(result.status, 404);
  assert.equal("error" in result.body ? result.body.error.code : null, "not_found");
  assert.equal("error" in result.body ? result.body.error.message : null, "Resource maintenance not found.");
});

test("resource maintenance application services stay framework neutral", () => {
  const source = readFileSync(join(sourceDir, "resource-maintenance.ts"), "utf8");

  for (const forbidden of [
    "next/",
    "next/server",
    "@supabase/",
    "@project-play/reservations-supabase",
    "Supabase",
    "supabase",
    "@/app/",
    "app/api",
    "@reservation-platform/sdk",
    "react",
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `resource-maintenance.ts should not import or reference ${forbidden}`,
    );
  }
});
