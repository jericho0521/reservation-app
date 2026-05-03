import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route";

test("GET /api/seat-maintenance returns 400 without service_id", async () => {
  const response = await GET(new Request("http://localhost/api/seat-maintenance"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "service_id is required",
  });
});
