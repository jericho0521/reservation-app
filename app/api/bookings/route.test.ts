import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";
import { buildBookingSearchFilter, normalizeBookingSearchTerm } from "./search-utils";

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

test("normalizeBookingSearchTerm trims blank searches", () => {
  assert.equal(normalizeBookingSearchTerm("   "), null);
  assert.equal(normalizeBookingSearchTerm("  Alex  "), "Alex");
});

test("buildBookingSearchFilter quotes reserved PostgREST characters", () => {
  assert.equal(
    buildBookingSearchFilter('Smith, Alex (VIP) "Racer"'),
    'user_name.ilike."%Smith, Alex (VIP) \\"Racer\\"%",user_email.ilike."%Smith, Alex (VIP) \\"Racer\\"%",user_phone.ilike."%Smith, Alex (VIP) \\"Racer\\"%"',
  );
});

test("buildBookingSearchFilter escapes SQL LIKE wildcards", () => {
  assert.equal(
    buildBookingSearchFilter("100%_ready\\now"),
    'user_name.ilike."%100\\\\%\\\\_ready\\\\\\\\now%",user_email.ilike."%100\\\\%\\\\_ready\\\\\\\\now%",user_phone.ilike."%100\\\\%\\\\_ready\\\\\\\\now%"',
  );
});
