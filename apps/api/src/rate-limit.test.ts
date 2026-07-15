import assert from "node:assert/strict";
import test from "node:test";
import { applyRateLimit } from "./rate-limit.js";

test("login limit hashes normalized account scope and returns Retry-After without revealing the account", async () => {
  const inputs: unknown[] = [];
  const response = await applyRateLimit({ method: "POST", path: "/v1/auth/login", headers: { "x-forwarded-for": "192.0.2.1" }, body: { email: " Owner@Example.test " } }, { async consumeRateLimit(input) { inputs.push(input); return { allowed: false, remaining: 0, retryAfterSeconds: 60 }; } });
  assert.equal(response?.status, 429);
  assert.equal(response?.headers["retry-after"], "60");
  assert.doesNotMatch(JSON.stringify(inputs), /owner@example\.test|192\.0\.2\.1/iu);
  assert.equal((inputs[0] as { routeGroup: string }).routeGroup, "login");
});

test("trusted internal service requests bypass public buckets", async () => {
  let calls = 0;
  const response = await applyRateLimit({ method: "POST", path: "/v1/auth/login", headers: { authorization: "Bearer service-key" }, body: {} }, { async consumeRateLimit() { calls += 1; return { allowed: false, remaining: 0, retryAfterSeconds: 60 }; } }, { serviceApiKey: "service-key" });
  assert.equal(response, undefined);
  assert.equal(calls, 0);
});

test("rate-limit storage failure returns a safe unavailable response", async () => {
  const response = await applyRateLimit({ method: "POST", path: "/v1/setup/owner", clientIp: "192.0.2.1" }, {
    async consumeRateLimit() { throw new Error("private database detail"); },
  });
  assert.equal(response?.status, 503);
  assert.doesNotMatch(JSON.stringify(response?.body), /private database/iu);
});
