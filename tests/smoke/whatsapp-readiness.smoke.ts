import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";

const backendBaseUrl = readBackendBaseUrl();

test("WhatsApp readiness route is stable when enabled or disabled", async (context) => {
  const response = await fetchJsonOrSkip(
    context,
    new URL("/v1/channels/whatsapp/readiness", backendBaseUrl),
    "WhatsApp readiness",
  );
  if (!response) {
    return;
  }

  if (response.status === 404) {
    assert.deepEqual(response.body, {
      error: {
        code: "whatsapp_module_disabled",
        message: "WhatsApp module is disabled.",
        status: 404,
      },
    });
    return;
  }

  assert.equal(response.status, 200);
  assert.equal(typeof response.body.database_ready, "boolean");
  assert.equal(typeof response.body.provider_ready, "boolean");
  assert.equal(typeof response.body.reservation_tools_ready, "boolean");
  assert.equal(typeof response.body.simulation_enabled, "boolean");
});

function readBackendBaseUrl() {
  const raw =
    process.env.RESERVATION_SMOKE_BACKEND_BASE_URL ??
    process.env.RESERVATION_PLATFORM_LIVE_BASE_URL ??
    process.env.RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL ??
    "http://localhost:4100";
  return new URL(raw);
}

async function fetchJson(url: URL, label: string) {
  const response = await fetch(url, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(readTimeoutMs()),
  });
  const text = await response.text();
  let body: Record<string, unknown>;
  try {
    body = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    throw new Error(`${label} returned non-JSON status ${response.status}: ${text.slice(0, 200)}`);
  }
  if (response.status === 401) {
    throw new Error(`${label} requires auth. Set RESERVATION_SMOKE_API_KEY for this backend.`);
  }
  return { status: response.status, body };
}

async function fetchJsonOrSkip(context: TestContext, url: URL, label: string) {
  try {
    return await fetchJson(url, label);
  } catch (error) {
    if (shouldSkipUnavailableBackend(error)) {
      context.skip(`Backend unavailable at ${backendBaseUrl.toString()}. Start it or set RESERVATION_SMOKE_BACKEND_BASE_URL.`);
      return undefined;
    }
    throw error;
  }
}

function authHeaders() {
  const apiKey = process.env.RESERVATION_SMOKE_API_KEY ?? process.env.RESERVATION_PLATFORM_LIVE_API_KEY;
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function readTimeoutMs() {
  const value = Number(process.env.RESERVATION_SMOKE_TIMEOUT_MS ?? "5000");
  return Number.isFinite(value) && value > 0 ? value : 5000;
}

function shouldSkipUnavailableBackend(error: unknown) {
  return !isStrictSmoke()
    && !hasExplicitBackendBaseUrl()
    && error instanceof TypeError
    && error.message === "fetch failed";
}

function isStrictSmoke() {
  return process.env.RESERVATION_SMOKE_STRICT === "1";
}

function hasExplicitBackendBaseUrl() {
  return Boolean(
    process.env.RESERVATION_SMOKE_BACKEND_BASE_URL ||
      process.env.RESERVATION_PLATFORM_LIVE_BASE_URL ||
      process.env.RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL,
  );
}
