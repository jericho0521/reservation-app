import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { jsonResponse } from "./http.js";
import { StandaloneSupabaseConfigError } from "./runtime.js";
import {
  closeStandaloneNodeServer,
  createStandaloneNodeServer,
  createStandaloneNodeServerFromEnv,
  type StructuredLogEntry,
} from "./server.js";

const standaloneHealthBody = {
  status: "ok",
  service: "standalone-api-skeleton",
  api_version: "v1",
  readiness: "alive",
};

test("rejects a JSON body above the configured byte limit without resetting the socket", async () => {
  let handlerCalls = 0;
  const server = createStandaloneNodeServer(async () => {
    handlerCalls += 1;
    return jsonResponse(200, { ok: true });
  }, {
    maxBodyBytes: 7,
  });

  await withListeningServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '"ééé"',
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      error: {
        code: "payload_too_large",
        message: "Request body is too large.",
        status: 413,
      },
    });
    assert.equal(handlerCalls, 0);
  });
});

test("accepts a multibyte JSON body exactly at the configured byte limit", async () => {
  let receivedBody: unknown;
  const server = createStandaloneNodeServer(async (request) => {
    receivedBody = request.body;
    return jsonResponse(200, { ok: true });
  }, {
    maxBodyBytes: Buffer.byteLength('"éé"'),
  });

  await withListeningServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '"éé"',
    });

    assert.equal(response.status, 200);
    assert.equal(receivedBody, "éé");
  });
});

test("returns and safely logs one validated correlation id", async () => {
  const entries: StructuredLogEntry[] = [];
  let handlerCorrelationId: string | string[] | undefined;
  const server = createStandaloneNodeServer(async (request) => {
    handlerCorrelationId = request.headers?.["x-correlation-id"];
    return jsonResponse(204, undefined);
  }, {
    logger: { write: (entry) => entries.push(entry) },
  });

  await withListeningServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/public/experiences/demo/manage/secret-management-token`, {
      headers: {
        Authorization: "Bearer must-not-be-logged",
        "x-correlation-id": "request-123",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("x-correlation-id"), "request-123");
    assert.equal(handlerCorrelationId, "request-123");
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.event, "http_request_completed");
  assert.equal(entries[0]?.correlationId, "request-123");
  assert.equal(entries[0]?.status, 204);
  assert.doesNotMatch(JSON.stringify(entries), /must-not-be-logged|secret-management-token/);
  assert.equal(entries[0]?.path, "/v1/public/experiences/demo/manage/:redacted");
});

test("replaces an invalid inbound correlation id", async () => {
  const entries: StructuredLogEntry[] = [];
  const server = createStandaloneNodeServer(async () => jsonResponse(200, { ok: true }), {
    logger: { write: (entry) => entries.push(entry) },
  });

  await withListeningServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/test`, {
      headers: { "x-correlation-id": "invalid id with spaces" },
    });
    const correlationId = response.headers.get("x-correlation-id");

    assert.match(correlationId ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    assert.equal(entries[0]?.correlationId, correlationId);
  });
});

test("configures bounded Node HTTP timeouts", () => {
  const server = createStandaloneNodeServer(undefined, {
    requestTimeoutMs: 30_000,
    headersTimeoutMs: 10_000,
    keepAliveTimeoutMs: 4_000,
  });

  assert.equal(server.requestTimeout, 30_000);
  assert.equal(server.headersTimeout, 10_000);
  assert.equal(server.keepAliveTimeout, 4_000);
});

test("closes a listening standalone server gracefully", async () => {
  const server = createStandaloneNodeServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  await closeStandaloneNodeServer(server);

  assert.equal(server.listening, false);
});

test("standalone env bootstrap serves health without Supabase env or client creation", async () => {
  let createClientCalls = 0;
  const server = createStandaloneNodeServerFromEnv({
    env: {},
    createClient() {
      createClientCalls += 1;
      throw new Error("Supabase client creation should not run without Supabase env.");
    },
  });

  await withListeningServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/health`);
    const body = await response.json() as unknown;

    assert.equal(response.status, 200);
    assert.deepEqual(body, standaloneHealthBody);
    assert.equal(createClientCalls, 0);
  });
});

test("standalone env bootstrap uses service-token-only auth without Supabase repositories", async () => {
  let createClientCalls = 0;
  const server = createStandaloneNodeServerFromEnv({
    env: {
      RESERVATION_PLATFORM_SERVICE_API_KEY: "platform-service-secret",
    },
    createClient() {
      createClientCalls += 1;
      throw new Error("Supabase client creation should not run for service-token-only env.");
    },
  });

  await withListeningServer(server, async (baseUrl) => {
    const missingBearer = await fetch(`${baseUrl}/v1/venues`);
    const wrongBearer = await fetch(`${baseUrl}/v1/venues`, {
      headers: { Authorization: "Bearer wrong-secret" },
    });
    const correctBearer = await fetch(`${baseUrl}/v1/venues`, {
      headers: { Authorization: "Bearer platform-service-secret" },
    });

    assert.equal(missingBearer.status, 401);
    assert.deepEqual(await missingBearer.json(), {
      error: {
        code: "unauthorized",
        message: "Missing bearer token.",
        status: 401,
      },
    });
    assert.equal(wrongBearer.status, 403);
    assert.deepEqual(await wrongBearer.json(), {
      error: {
        code: "forbidden",
        message: "Invalid service bearer token.",
        status: 403,
      },
    });
    assert.equal(correctBearer.status, 503);
    assert.deepEqual(await correctBearer.json(), {
      error: {
        code: "bad_request",
        message: "Catalog repository is not configured.",
        status: 503,
      },
    });
    assert.equal(createClientCalls, 0);
  });
});

test("standalone env bootstrap serves configured browser CORS preflight and response headers", async () => {
  const server = createStandaloneNodeServerFromEnv({
    env: {
      RESERVATION_PLATFORM_SERVICE_API_KEY: "platform-service-secret",
      RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS: "http://frontend.example.test",
    },
    createClient() {
      throw new Error("Supabase client creation should not run for service-token-only env.");
    },
  });

  await withListeningServer(server, async (baseUrl) => {
    const preflight = await fetch(`${baseUrl}/v1/services`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://frontend.example.test",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,x-reservation-tenant-id",
      },
    });
    const dataResponse = await fetch(`${baseUrl}/v1/services`, {
      headers: {
        Origin: "http://frontend.example.test",
      },
    });
    const blockedPreflight = await fetch(`${baseUrl}/v1/services`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://blocked.example.test",
        "Access-Control-Request-Method": "GET",
      },
    });

    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "http://frontend.example.test");
    assert.equal(preflight.headers.get("access-control-allow-methods"), "GET,POST,PATCH,OPTIONS");
    assert.equal(preflight.headers.get("access-control-allow-headers"), "authorization,x-reservation-tenant-id");
    assert.equal(dataResponse.status, 401);
    assert.equal(dataResponse.headers.get("access-control-allow-origin"), "http://frontend.example.test");
    assert.equal(blockedPreflight.status, 403);
    assert.equal(blockedPreflight.headers.get("access-control-allow-origin"), null);
  });
});

test("standalone env bootstrap fails closed for partial Supabase env before exposing a server", () => {
  let createClientCalls = 0;

  assert.throws(
    () => createStandaloneNodeServerFromEnv({
      env: {
        RESERVATION_SUPABASE_URL: "https://example.supabase.co",
        RESERVATION_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      },
      createClient() {
        createClientCalls += 1;
        throw new Error("Supabase client creation should not run for partial config.");
      },
    }),
    (error) => {
      assert.equal(error instanceof StandaloneSupabaseConfigError, true);
      assert.deepEqual(
        (error as StandaloneSupabaseConfigError).missingConfigKeys,
        ["RESERVATION_SUPABASE_ANON_KEY"],
      );
      return true;
    },
  );
  assert.equal(createClientCalls, 0);
});

async function withListeningServer<T>(
  server: Server,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address() as AddressInfo | null;
    if (!address) {
      throw new Error("Standalone Node server did not expose a listen address.");
    }

    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await closeServer(server);
  }
}

async function closeServer(server: Server) {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
