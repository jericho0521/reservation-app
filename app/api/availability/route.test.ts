import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route";

test("GET /api/availability returns 400 when required params are missing", async () => {
  const response = await GET(new Request("http://localhost/api/availability"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "service_id and date are required",
  });
});
