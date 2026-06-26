import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStandaloneBackendHealthUrl,
  readStandaloneBackendLiveProofConfig,
  standaloneBackendLiveProofBaseUrlEnvName,
  verifyStandaloneBackendLiveProof,
} from "./verify-standalone-backend-live-proof.mjs";

function validLiveProofEnv(overrides = {}) {
  return {
    RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL: "https://backend.example.test",
    ...overrides,
  };
}

function jsonResponse(status, body, headers = { "content-type": "application/json; charset=utf-8" }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] ?? headers[name] ?? "";
      },
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

test("standalone backend live proof safely skips when env is absent", async () => {
  let fetchCalls = 0;
  const parsed = await verifyStandaloneBackendLiveProof({}, {
    argv: [],
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not run for skipped config");
    },
  });

  assert.equal(parsed.status, "skip");
  assert.equal(parsed.shouldSkip, true);
  assert.equal(parsed.shouldFail, false);
  assert.equal(parsed.ready, false);
  assert.equal(parsed.ok, false);
  assert.equal(fetchCalls, 0);
  assert.deepEqual(parsed.missing, [standaloneBackendLiveProofBaseUrlEnvName]);
});

test("standalone backend live proof fails strict mode when env is absent", async () => {
  let fetchCalls = 0;
  const parsed = await verifyStandaloneBackendLiveProof({}, {
    argv: ["--strict"],
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not run for failed config");
    },
  });

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.strict, true);
  assert.equal(parsed.shouldFail, true);
  assert.equal(parsed.ready, false);
  assert.equal(fetchCalls, 0);
});

test("standalone backend live proof rejects malformed base URL, path, and timeout without fetching", async () => {
  let fetchCalls = 0;
  const parsed = await verifyStandaloneBackendLiveProof(
    validLiveProofEnv({
      RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL: "not-a-url",
      RESERVATION_STANDALONE_BACKEND_LIVE_HEALTH_PATH: "v1/health",
      RESERVATION_STANDALONE_BACKEND_LIVE_TIMEOUT_MS: "0",
    }),
    {
      argv: [],
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not run for malformed config");
      },
    },
  );

  assert.equal(parsed.status, "skip");
  assert.equal(parsed.shouldSkip, true);
  assert.equal(fetchCalls, 0);
  assert.match(parsed.message, /must be an absolute URL/);
  assert.match(parsed.message, /must start with "\/"/);
  assert.match(parsed.message, /must be a positive integer/);
});

test("standalone backend live proof rejects unsupported URL schemes and oversized timeout in strict mode", () => {
  const parsed = readStandaloneBackendLiveProofConfig(
    validLiveProofEnv({
      RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL: "ftp://backend.example.test",
      RESERVATION_STANDALONE_BACKEND_LIVE_TIMEOUT_MS: "60001",
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "fail");
  assert.match(parsed.message, /must use http or https/);
  assert.match(parsed.message, /must be between 1 and 60000/);
});

test("standalone backend live proof URL builder preserves base paths with or without trailing slash", () => {
  assert.equal(
    buildStandaloneBackendHealthUrl("https://backend.example.test", "/v1/health").toString(),
    "https://backend.example.test/v1/health",
  );
  assert.equal(
    buildStandaloneBackendHealthUrl("https://backend.example.test/", "/v1/health").toString(),
    "https://backend.example.test/v1/health",
  );
  assert.equal(
    buildStandaloneBackendHealthUrl("https://backend.example.test/platform", "/v1/health").toString(),
    "https://backend.example.test/platform/v1/health",
  );
  assert.equal(
    buildStandaloneBackendHealthUrl("https://backend.example.test/platform/", "/v1/health?ready=1").toString(),
    "https://backend.example.test/platform/v1/health?ready=1",
  );
});

test("standalone backend live proof succeeds against mocked fetch", async () => {
  const calls = [];
  const parsed = await verifyStandaloneBackendLiveProof(
    validLiveProofEnv({
      RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL: "https://backend.example.test/platform/",
      RESERVATION_STANDALONE_BACKEND_LIVE_HEALTH_PATH: "/v1/health",
      RESERVATION_STANDALONE_BACKEND_LIVE_TIMEOUT_MS: "1234",
    }),
    {
      argv: ["--strict"],
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return jsonResponse(200, {
          status: "ok",
          service: "standalone-api-skeleton",
          api_version: "v1",
          readiness: "alive",
        });
      },
    },
  );

  assert.equal(parsed.status, "ready");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.config.healthUrl, "https://backend.example.test/platform/v1/health");
  assert.equal(parsed.config.timeoutMs, 1234);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://backend.example.test/platform/v1/health");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Accept, "application/json");
  assert.equal(parsed.proof.status, 200);
  assert.equal(parsed.proof.body.readiness, "alive");
});

test("standalone backend live proof fails when health endpoint returns non-ok", async () => {
  const parsed = await verifyStandaloneBackendLiveProof(validLiveProofEnv(), {
    argv: ["--strict"],
    fetchImpl: async () => jsonResponse(503, { error: { code: "unavailable" } }),
  });

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.shouldFail, true);
  assert.equal(parsed.ok, false);
  assert.match(parsed.message, /returned status 503/);
});

test("standalone backend live proof fails when health endpoint returns non-JSON", async () => {
  const parsed = await verifyStandaloneBackendLiveProof(validLiveProofEnv(), {
    argv: ["--strict"],
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: {
        get() {
          return "text/plain";
        },
      },
      async text() {
        return "ok";
      },
    }),
  });

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.shouldFail, true);
  assert.equal(parsed.ok, false);
  assert.match(parsed.message, /non-JSON content-type/);
});

test("standalone backend live proof fails when 2xx JSON health body has wrong contract values", async () => {
  const parsed = await verifyStandaloneBackendLiveProof(validLiveProofEnv(), {
    argv: ["--strict"],
    fetchImpl: async () => jsonResponse(200, {
      status: "healthy",
      service: "next-compatibility-app",
      api_version: "v2",
      readiness: "ready",
    }),
  });

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.shouldFail, true);
  assert.equal(parsed.ok, false);
  assert.match(parsed.message, /malformed standalone health body/);
  assert.match(parsed.message, /status must be "ok"/);
  assert.match(parsed.message, /service must be "standalone-api-skeleton"/);
  assert.match(parsed.message, /api_version must be "v1"/);
  assert.match(parsed.message, /readiness must be "alive"/);
});

test("standalone backend live proof fails when 2xx JSON health body is missing contract keys", async () => {
  const parsed = await verifyStandaloneBackendLiveProof(validLiveProofEnv(), {
    argv: ["--strict"],
    fetchImpl: async () => jsonResponse(200, {
      status: "ok",
      service: "standalone-api-skeleton",
    }),
  });

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.shouldFail, true);
  assert.equal(parsed.ok, false);
  assert.match(parsed.message, /malformed standalone health body/);
  assert.match(parsed.message, /missing api_version/);
  assert.match(parsed.message, /missing readiness/);
});

test("standalone backend live proof fails when 2xx JSON health body includes extra keys", async () => {
  const parsed = await verifyStandaloneBackendLiveProof(validLiveProofEnv(), {
    argv: ["--strict"],
    fetchImpl: async () => jsonResponse(200, {
      status: "ok",
      service: "standalone-api-skeleton",
      api_version: "v1",
      readiness: "alive",
      build: "2026-06-25",
    }),
  });

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.shouldFail, true);
  assert.equal(parsed.ok, false);
  assert.match(parsed.message, /malformed standalone health body/);
  assert.match(parsed.message, /unexpected build/);
});
