import assert from "node:assert/strict";
import test from "node:test";
import { handleStandaloneApiRequest } from "./routes.js";

test("system status is authenticated and returns only safe aggregate health", async () => {
  const dependencies = {
    serviceApiKey: "service-key",
    readinessCheck: async () => ({ database: true, migrations: true }),
    systemStatus: {
      repository: { async readSystemSnapshot() { return { heartbeats: [], jobs: { pending: 0, failed: 0 }, integrations: {} }; } },
      releaseVersion: "1.0.0", migrationVersion: "000035", now: () => new Date("2026-07-15T00:00:00Z"),
    },
  };
  const unauthorized = await handleStandaloneApiRequest({ method: "GET", path: "/v1/system/status" }, dependencies);
  const authorized = await handleStandaloneApiRequest({ method: "GET", path: "/v1/system/status", headers: { authorization: "Bearer service-key" } }, dependencies);
  assert.equal(unauthorized.status, 401);
  assert.equal(authorized.status, 200);
  assert.equal((authorized.body as { release_version: string }).release_version, "1.0.0");
  assert.doesNotMatch(JSON.stringify(authorized.body), /Bearer|service-key|stack|customer/iu);
});
