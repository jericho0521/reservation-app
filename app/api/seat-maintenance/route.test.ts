import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route";
import { isSeatMaintenanceSupportedService } from "./service-support";

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
