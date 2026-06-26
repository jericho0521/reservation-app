import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextRequest } from "next/server";
import { getCompatibilityRouteDeprecationTarget, proxy } from "./proxy";

test("compatibility deprecation target maps legacy reservation routes to standalone v1 routes", () => {
  assert.equal(getCompatibilityRouteDeprecationTarget("/api/services"), "/v1/services");
  assert.equal(getCompatibilityRouteDeprecationTarget("/api/services/service_123"), "/v1/services/service_123");
  assert.equal(getCompatibilityRouteDeprecationTarget("/api/venues/venue_123"), "/v1/venues/venue_123");
  assert.equal(getCompatibilityRouteDeprecationTarget("/api/availability"), "/v1/availability");
  assert.equal(getCompatibilityRouteDeprecationTarget("/api/bookings/booking_123"), "/v1/reservations/booking_123");
  assert.equal(getCompatibilityRouteDeprecationTarget("/api/seat-maintenance"), "/v1/resource-maintenance");
});

test("compatibility deprecation target maps current app v1 shims to standalone v1 routes", () => {
  assert.equal(getCompatibilityRouteDeprecationTarget("/api/v1/metadata"), "/v1/metadata");
  assert.equal(getCompatibilityRouteDeprecationTarget("/api/v1/services"), "/v1/services");
  assert.equal(getCompatibilityRouteDeprecationTarget("/api/v1/resources/resource_123"), "/v1/resources/resource_123");
  assert.equal(
    getCompatibilityRouteDeprecationTarget("/api/v1/reservations/res_123/cancel"),
    "/v1/reservations/res_123/cancel",
  );
  assert.equal(
    getCompatibilityRouteDeprecationTarget("/api/v1/resource-maintenance/maint_123/end"),
    "/v1/resource-maintenance/maint_123/end",
  );
});

test("compatibility deprecation target ignores app-owned and optional chat routes", () => {
  assert.equal(getCompatibilityRouteDeprecationTarget("/api/blogs"), null);
  assert.equal(getCompatibilityRouteDeprecationTarget("/api/analytics-reports"), null);
  assert.equal(getCompatibilityRouteDeprecationTarget("/api/chat"), null);
  assert.equal(getCompatibilityRouteDeprecationTarget("/api/v1/chat/reservation-sessions"), null);
});

test("proxy adds deprecation headers without rewriting compatibility requests", () => {
  const response = proxy({ nextUrl: { pathname: "/api/bookings/booking_123" } } as NextRequest);

  assert.equal(response.headers.get("Deprecation"), "true");
  assert.equal(response.headers.get("Link"), "</v1/reservations/booking_123>; rel=\"successor-version\"");
  assert.equal(response.headers.get("X-Reservation-Compatibility-Route"), "deprecated");
  assert.equal(response.headers.get("X-Reservation-Compatibility-Status"), "remove-later");
  assert.equal(response.headers.get("X-Reservation-Standalone-Route"), "/v1/reservations/booking_123");
});

test("proxy leaves non-deprecated API routes unmarked", () => {
  const response = proxy({ nextUrl: { pathname: "/api/blogs" } } as NextRequest);

  assert.equal(response.headers.get("Deprecation"), null);
  assert.equal(response.headers.get("X-Reservation-Compatibility-Route"), null);
});
