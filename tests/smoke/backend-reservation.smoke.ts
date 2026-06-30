import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";

const backendBaseUrl = readBackendBaseUrl();

test("backend reservation catalog and availability routes are readable", async (context) => {
  const metadata = await fetchJsonOrSkip(context, new URL("/v1/metadata", backendBaseUrl), "metadata");
  if (!metadata) {
    return;
  }
  assert.equal(metadata.status, 200);
  assert.equal(metadata.body.api_version, "v1");

  const servicesResponse = await fetchJson(new URL("/v1/services", backendBaseUrl), "services");
  assert.equal(servicesResponse.status, 200);
  assert.equal(Array.isArray(servicesResponse.body.services), true);

  const services = servicesResponse.body.services as Array<{ service_id?: string }>;
  const serviceId = process.env.RESERVATION_SMOKE_SERVICE_ID ?? services[0]?.service_id;
  if (!serviceId) {
    context.skip("No service id available. Set RESERVATION_SMOKE_SERVICE_ID or seed at least one service.");
    return;
  }

  const availabilityUrl = new URL("/v1/availability", backendBaseUrl);
  availabilityUrl.searchParams.set("service_id", serviceId);
  availabilityUrl.searchParams.set("date", process.env.RESERVATION_SMOKE_DATE ?? todayIsoDate());

  const availability = await fetchJson(availabilityUrl, "availability");
  assert.equal(availability.status, 200);
  assert.equal(Array.isArray(availability.body.slots), true);
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
  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}: ${JSON.stringify(body)}`);
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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
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
