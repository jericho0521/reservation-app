import { type NextRequest, NextResponse } from "next/server";

import { authRedirect, buildMiddlewareRequestHeaders } from "./lib/auth-session";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const destination = authRedirect({
    pathname,
    hasSessionCookie: request.cookies.has("reservation_session"),
  });
  if (destination) return NextResponse.redirect(new URL(destination, request.url));

  const requestHeaders = buildMiddlewareRequestHeaders(pathname, request.headers);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/:path*"],
};
