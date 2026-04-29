import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";

test("POST /api/bookings returns 400 for invalid booking payloads", async () => {
  const response = await POST(new Request("http://localhost/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }));

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, "Invalid booking data");
  assert.equal(Array.isArray(payload.details), true);
});

test("POST /api/bookings returns 400 for malformed JSON", async () => {
  const response = await POST(new Request("http://localhost/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Invalid JSON body",
  });
});
