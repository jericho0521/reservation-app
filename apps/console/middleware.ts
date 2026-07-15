import { type NextRequest, NextResponse } from "next/server";

import { authRedirect, isPublicAdminPath } from "./lib/auth-session";

const publicRouteHeader = "x-reservation-console-public-route";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const destination = authRedirect({
    pathname,
    hasSessionCookie: request.cookies.has("reservation_session"),
  });
  if (destination) return NextResponse.redirect(new URL(destination, request.url));

  const requestHeaders = new Headers(request.headers);
  if (isPublicAdminPath(pathname)) requestHeaders.set(publicRouteHeader, "1");
  else requestHeaders.delete(publicRouteHeader);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/:path*"],
};
