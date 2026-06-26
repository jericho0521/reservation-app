import { NextResponse, type NextRequest } from "next/server";

const compatibilityPrefixTargets = [
  { prefix: "/api/v1/resource-maintenance", targetPrefix: "/v1/resource-maintenance" },
  { prefix: "/api/v1/resource-layouts", targetPrefix: "/v1/resource-layouts" },
  { prefix: "/api/v1/reservations", targetPrefix: "/v1/reservations" },
  { prefix: "/api/v1/availability", targetPrefix: "/v1/availability" },
  { prefix: "/api/v1/resources", targetPrefix: "/v1/resources" },
  { prefix: "/api/v1/services", targetPrefix: "/v1/services" },
  { prefix: "/api/v1/metadata", targetPrefix: "/v1/metadata" },
  { prefix: "/api/v1/venues", targetPrefix: "/v1/venues" },
  { prefix: "/api/seat-maintenance", targetPrefix: "/v1/resource-maintenance" },
  { prefix: "/api/availability", targetPrefix: "/v1/availability" },
  { prefix: "/api/services", targetPrefix: "/v1/services" },
  { prefix: "/api/bookings", targetPrefix: "/v1/reservations" },
  { prefix: "/api/venues", targetPrefix: "/v1/venues" },
];

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const target = getCompatibilityRouteDeprecationTarget(request.nextUrl.pathname);

  if (target) {
    response.headers.set("Deprecation", "true");
    response.headers.set("Link", `<${target}>; rel="successor-version"`);
    response.headers.set("X-Reservation-Compatibility-Route", "deprecated");
    response.headers.set("X-Reservation-Compatibility-Status", "remove-later");
    response.headers.set("X-Reservation-Standalone-Route", target);
  }

  return response;
}

export function getCompatibilityRouteDeprecationTarget(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);

  for (const { prefix, targetPrefix } of compatibilityPrefixTargets) {
    const suffix = matchPrefixSuffix(normalizedPathname, prefix);
    if (suffix !== null) {
      return `${targetPrefix}${suffix}`;
    }
  }

  return null;
}

function normalizePathname(pathname: string) {
  if (!pathname.startsWith("/")) {
    return `/${pathname}`;
  }

  return pathname;
}

function matchPrefixSuffix(pathname: string, prefix: string) {
  if (pathname === prefix) {
    return "";
  }

  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length);
  }

  return null;
}

export const config = {
  matcher: ["/api/:path*"],
};
