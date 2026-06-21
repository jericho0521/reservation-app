import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { StandaloneSupabaseConfigError } from "./runtime.js";
import { createStandaloneNodeServerFromEnv } from "./server.js";

const standaloneHealthBody = {
  status: "ok",
  service: "standalone-api-skeleton",
  api_version: "v1",
  readiness: "alive",
};

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
