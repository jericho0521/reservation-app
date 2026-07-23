import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  authRedirect,
  buildInternalApiFetchInit,
  buildMiddlewareRequestHeaders,
  buildPlatformForwardHeaders,
  buildSessionForwardHeaders,
  resolveActiveLocation,
  secureSessionCookie,
  validateActiveVenueSelection,
} from "./auth-session.js";

test("active venue cookies follow the explicit deployment cookie policy", () => {
  assert.equal(secureSessionCookie({ NODE_ENV: "production", RESERVATION_SESSION_COOKIE_SECURE: "false" }), false);
  assert.equal(secureSessionCookie({ NODE_ENV: "development", RESERVATION_SESSION_COOKIE_SECURE: "true" }), true);
  assert.equal(secureSessionCookie({ NODE_ENV: "production" }), true);
  assert.equal(secureSessionCookie({ NODE_ENV: "development" }), false);
});

test("protected route redirects an anonymous request to login", () => {
  assert.equal(
    authRedirect({ pathname: "/reservations", hasSessionCookie: false }),
    "/admin/login",
  );
  assert.equal(authRedirect({ pathname: "/reservations", hasSessionCookie: true }), undefined);
});

test("login and setup remain public without a session", () => {
  assert.equal(authRedirect({ pathname: "/login", hasSessionCookie: false }), undefined);
  assert.equal(authRedirect({ pathname: "/setup", hasSessionCookie: false }), undefined);
  assert.equal(authRedirect({ pathname: `/invite/${"i".repeat(43)}`, hasSessionCookie: false }), undefined);
  assert.equal(authRedirect({ pathname: "/reset-password", hasSessionCookie: false }), undefined);
  assert.equal(authRedirect({ pathname: `/reset-password/${"r".repeat(43)}`, hasSessionCookie: false }), undefined);
});

test("server API headers forward only session cookies and add CSRF for writes", () => {
  assert.deepEqual(buildSessionForwardHeaders(
    "other=value; reservation_session=session-token; reservation_csrf=csrf-token; setup_token=secret",
  ), {
    cookie: "reservation_session=session-token; reservation_csrf=csrf-token",
    "X-CSRF-Token": "csrf-token",
  });
});

test("server API headers omit malformed and duplicate auth cookies", () => {
  assert.deepEqual(buildSessionForwardHeaders("other=value"), {});
  assert.deepEqual(buildSessionForwardHeaders(
    "reservation_session=one; reservation_session=two; reservation_csrf=csrf",
  ), { "X-CSRF-Token": "csrf" });
});

test("server API writes forward only narrow auth, active venue, and exact same-origin headers", () => {
  const forwarded = buildPlatformForwardHeaders(
    "other=value; reservation_session=session-token; reservation_csrf=csrf-token; reservation_active_venue=venue-a; setup_token=secret",
  );
  const init = buildInternalApiFetchInit(
    { method: "PATCH", headers: forwarded },
    new Headers({
      host: "booking.example",
      origin: "https://booking.example",
      "x-forwarded-proto": "https",
    }),
  );
  const headers = new Headers(init.headers);
  assert.equal(headers.get("cookie"), "reservation_session=session-token; reservation_csrf=csrf-token");
  assert.equal(headers.get("x-csrf-token"), "csrf-token");
  assert.equal(headers.get("x-reservation-venue-id"), "venue-a");
  assert.equal(headers.get("origin"), "https://booking.example");
  assert.equal(headers.has("setup_token"), false);

  const readHeaders = new Headers(buildInternalApiFetchInit(
    { method: "GET", headers: { Origin: "https://spoofed.example" } },
    new Headers({ host: "booking.example", origin: "https://booking.example" }),
  ).headers);
  assert.equal(readHeaders.has("origin"), false);

  for (const incoming of [
    new Headers({ host: "booking.example", origin: "https://attacker.example" }),
    new Headers({ host: "booking.example", origin: "https://booking.example", "x-forwarded-proto": "http" }),
  ]) {
    const rejected = new Headers(buildInternalApiFetchInit({ method: "POST" }, incoming).headers);
    assert.equal(rejected.has("origin"), false);
  }
});

test("active location defaults only a sole assignment and requires an explicit valid multi-location selection", () => {
  assert.deepEqual(resolveActiveLocation([], undefined), { kind: "onboarding" });
  assert.deepEqual(resolveActiveLocation(["venue-a"], undefined), {
    kind: "ready",
    venueId: "venue-a",
    canChange: false,
  });
  assert.deepEqual(resolveActiveLocation(["venue-a", "venue-b"], undefined), {
    kind: "selection_required",
    venueIds: ["venue-a", "venue-b"],
  });
  assert.deepEqual(resolveActiveLocation(["venue-a", "venue-b"], "venue-b"), {
    kind: "ready",
    venueId: "venue-b",
    canChange: true,
  });
  assert.equal(validateActiveVenueSelection(["venue-a", "venue-b"], "venue-b"), "venue-b");
  assert.equal(validateActiveVenueSelection(["venue-a", "venue-b"], "venue-c"), undefined);
});

test("middleware derives trusted route headers and compiles relative to the admin base path", () => {
  const spoofed = new Headers({
    "x-reservation-console-public-route": "1",
    "x-reservation-console-location-route": "1",
  });
  const protectedHeaders = buildMiddlewareRequestHeaders("/reservations", spoofed);
  assert.equal(protectedHeaders.has("x-reservation-console-public-route"), false);
  assert.equal(protectedHeaders.has("x-reservation-console-location-route"), false);
  assert.equal(buildMiddlewareRequestHeaders("/login", spoofed).get("x-reservation-console-public-route"), "1");
  assert.equal(buildMiddlewareRequestHeaders("/setup", spoofed).get("x-reservation-console-public-route"), "1");
  assert.equal(buildMiddlewareRequestHeaders("/location", spoofed).get("x-reservation-console-location-route"), "1");
  assert.equal(buildMiddlewareRequestHeaders("/onboarding", spoofed).get("x-reservation-console-onboarding-route"), "1");
  assert.equal(buildMiddlewareRequestHeaders("/setup/business", spoofed).get("x-reservation-console-onboarding-route"), "1");

  const probe = spawnSync(process.execPath, ["--eval", [
    "const { getMiddlewareMatchers } = require('next/dist/build/analysis/get-page-static-info.js');",
    "const matchers = getMiddlewareMatchers(['/', '/((?!_next/static|_next/image|favicon.ico).*)'], { basePath: '/admin' });",
    "const matches = (pathname) => matchers.some(({ regexp }) => new RegExp(regexp, 'u').test(pathname));",
    "process.stdout.write(JSON.stringify(['/admin', '/admin/login', '/admin/setup', '/admin/reservations', '/admin/_next/static/chunk.js', '/reservations'].map(matches)));",
  ].join("\n")], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  });
  assert.equal(probe.status, 0, probe.stderr);
  assert.deepEqual(JSON.parse(probe.stdout), [true, true, true, true, false, false]);
});

test("browser auth forms use the same-origin API proxy and replace token-bearing history", async () => {
  const [login, setup, middleware, nextConfig, layout, locationAction, locationPage, onboardingPage] = await Promise.all([
    readFile(new URL("../components/auth/login-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/auth/setup-owner-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../middleware.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/location/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/location/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(login, /fetch\("\/v1\/auth\/login"/u);
  assert.match(setup, /fetch\("\/v1\/setup\/owner"/u);
  for (const source of [login, setup]) {
    assert.match(source, /credentials: "include"/u);
    assert.match(source, /window\.location\.replace\("\/admin"\)/u);
    assert.doesNotMatch(source, /localStorage|sessionStorage|console\./u);
  }
  assert.match(setup, /history\.replaceState\(null, "", "\/admin\/setup"\)/u);
  assert.match(nextConfig, /process\.env\.RESERVATION_PLATFORM_BASE_URL/u);
  assert.match(nextConfig, /source: "\/v1\/:path\*"/u);
  assert.match(nextConfig, /destination: `\$\{platformBaseUrl\}\/v1\/:path\*`/u);
  assert.match(nextConfig, /basePath: false/u);
  assert.match(middleware, /pathname\.startsWith\("\/admin\/_next\/"\)/u);
  assert.match(middleware, /matcher: \["\/", "\/\(\(\?!_next\/static\|_next\/image\|favicon\.ico\)\.\*\)"\]/u);
  assert.match(layout, /getSession\(\)/u);
  assert.match(layout, /redirect\("\/login"\)/u);
  assert.match(layout, /redirect\("\/onboarding"\)/u);
  assert.match(layout, /redirect\("\/location"\)/u);
  assert.match(locationAction, /redirect\("\/"\)/u);
  assert.match(locationPage, /redirect\("\/onboarding"\)/u);
  assert.match(onboardingPage, /redirect\(data\.state\.nextStep \? `\/setup\/\$\{data\.state\.nextStep\}` : "\/"\)/u);
  for (const source of [layout, locationAction, locationPage, onboardingPage]) {
    assert.doesNotMatch(source, /redirect\("\/admin/u);
  }
});
