import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";
import { getBookingDateBounds } from "@/lib/booking-schedule";
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

test("POST /api/bookings rejects past dates before accessing the database", async () => {
  const response = await POST(new Request("http://localhost/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: "11111111-1111-4111-8111-111111111111",
      user_name: "Alex Tan",
      user_email: "alex@example.com",
      user_phone: "+60 12-345 6789",
      booking_date: "2000-01-01",
      start_time: "12:00",
      end_time: "14:00",
      seats_booked: 1,
      interface_type: "form",
    }),
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Booking date must be between today and 30 days from today",
  });
});

test("POST /api/bookings rejects non-hourly time ranges before accessing the database", async () => {
  const response = await POST(new Request("http://localhost/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: "11111111-1111-4111-8111-111111111111",
      user_name: "Alex Tan",
      user_email: "alex@example.com",
      user_phone: "+60 12-345 6789",
      booking_date: getBookingDateBounds().maxDate,
      start_time: "12:30",
      end_time: "14:30",
      seats_booked: 1,
      interface_type: "form",
    }),
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Booking time must be a continuous range within operating hours",
  });
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
