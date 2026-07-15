import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { authRedirect, buildSessionForwardHeaders } from "./auth-session.js";

test("protected route redirects an anonymous request to login", () => {
  assert.equal(
    authRedirect({ pathname: "/admin/reservations", hasSessionCookie: false }),
    "/admin/login",
  );
  assert.equal(authRedirect({ pathname: "/admin/reservations", hasSessionCookie: true }), undefined);
});

test("login and setup remain public without a session", () => {
  assert.equal(authRedirect({ pathname: "/admin/login", hasSessionCookie: false }), undefined);
  assert.equal(authRedirect({ pathname: "/admin/setup", hasSessionCookie: false }), undefined);
});

test("server API headers forward only session cookies and add CSRF for writes", () => {
  assert.deepEqual(buildSessionForwardHeaders(
    "other=value; reservation_session=session-token; reservation_csrf=csrf-token; setup_token=secret",
    "https://booking.example",
  ), {
    cookie: "reservation_session=session-token; reservation_csrf=csrf-token",
    "X-CSRF-Token": "csrf-token",
    Origin: "https://booking.example",
  });
});

test("server API headers omit malformed and duplicate auth cookies", () => {
  assert.deepEqual(buildSessionForwardHeaders("other=value"), {});
  assert.deepEqual(buildSessionForwardHeaders(
    "reservation_session=one; reservation_session=two; reservation_csrf=csrf",
  ), { "X-CSRF-Token": "csrf" });
});

test("browser auth forms use same-origin cookie requests and replace token-bearing history", async () => {
  const [login, setup, middleware, layout] = await Promise.all([
    readFile(new URL("../components/auth/login-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/auth/setup-owner-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../middleware.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(login, /fetch\("\/v1\/auth\/login"/u);
  assert.match(setup, /fetch\("\/v1\/setup\/owner"/u);
  for (const source of [login, setup]) {
    assert.match(source, /credentials: "include"/u);
    assert.match(source, /window\.location\.replace\("\/admin"\)/u);
    assert.doesNotMatch(source, /localStorage|sessionStorage|console\./u);
  }
  assert.match(setup, /history\.replaceState\(null, "", "\/admin\/setup"\)/u);
  assert.match(middleware, /matcher: \["\/:path\*"\]/u);
  assert.match(layout, /getSession\(\)/u);
  assert.match(layout, /redirect\("\/admin\/login"\)/u);
});
