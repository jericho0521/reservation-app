import assert from "node:assert/strict";
import test from "node:test";
import {
  GET,
  isResourceMaintenanceSupportedService,
  isSeatMaintenanceSupportedService,
  normalizeMaintenanceResourceLabels,
} from "./route";

test("GET /api/seat-maintenance returns 400 without service_id", async () => {
  const response = await GET(new Request("http://localhost/api/seat-maintenance"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "service_id is required",
  });
});

test("seat maintenance is only supported for 16-seat racing services", () => {
  assert.equal(isSeatMaintenanceSupportedService({ total_seats: 16 }), true);
  assert.equal(isSeatMaintenanceSupportedService({ total_seats: 2 }), false);
  assert.equal(isSeatMaintenanceSupportedService(null), false);
});

test("resource maintenance supports assigned-resource services", () => {
  assert.equal(isResourceMaintenanceSupportedService({
    total_seats: 40,
    selection_mode: "assigned_resource",
  }), true);
  assert.equal(isResourceMaintenanceSupportedService({
    total_seats: 2,
    selection_mode: "quantity",
  }), false);
  assert.equal(isResourceMaintenanceSupportedService(null), false);
});

test("maintenance labels can use configured non-racing resources", () => {
  const result = normalizeMaintenanceResourceLabels(["A10", "A2", "A2"], {
    total_seats: 40,
    selection_mode: "assigned_resource",
    resources: [
      { label: "A2", is_active: true },
      { label: "A10", is_active: true },
      { label: "A11", is_active: false },
    ],
  });

  assert.deepEqual(result, {
    labels: ["A2", "A10"],
    isValid: true,
  });
});

test("maintenance labels reject resources outside configured metadata", () => {
  const result = normalizeMaintenanceResourceLabels(["A11"], {
    total_seats: 40,
    selection_mode: "assigned_resource",
    resources: [{ label: "A10", is_active: true }],
  });

  assert.deepEqual(result, {
    labels: ["A11"],
    isValid: false,
  });
});

test("16-capacity generic resources do not use racing label validation", () => {
  const result = normalizeMaintenanceResourceLabels(["Lane 2"], {
    total_seats: 16,
    selection_mode: "assigned_resource",
    resources: [
      { label: "Lane 1", is_active: true },
      { label: "Lane 2", is_active: true },
    ],
  });

  assert.deepEqual(result, {
    labels: ["Lane 2"],
    isValid: true,
  });
});
