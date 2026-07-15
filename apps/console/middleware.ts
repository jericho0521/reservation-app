import { type NextRequest, NextResponse } from "next/server";

import { authRedirect, buildMiddlewareRequestHeaders } from "./lib/auth-session";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/admin/_next/") || pathname.startsWith("/_next/")) {
    return NextResponse.next();
  }
  const destination = authRedirect({
    pathname,
    hasSessionCookie: request.cookies.has("reservation_session"),
  });
  if (destination) return NextResponse.redirect(new URL(destination, request.url));

  const requestHeaders = buildMiddlewareRequestHeaders(pathname, request.headers);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
