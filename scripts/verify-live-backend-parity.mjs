#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();
export const liveBackendParityRequiredEnvNames = [
  "RESERVATION_PLATFORM_LIVE_BASE_URL",
  "RESERVATION_PLATFORM_LIVE_TENANT_ID",
  "RESERVATION_PLATFORM_LIVE_API_KEY",
  "RESERVATION_PLATFORM_LIVE_SERVICE_ID",
  "RESERVATION_PLATFORM_LIVE_RESOURCE_ID",
  "RESERVATION_PLATFORM_LIVE_START_AT",
  "RESERVATION_PLATFORM_LIVE_END_AT",
];

export function buildReservationListQuery(config, reservation) {
  const status = reservation?.status ?? "confirmed";
  const startAt = reservation?.start_at ?? config.startAt;
  const endAt = reservation?.end_at ?? config.endAt;

  return {
    service_id: reservation?.service_id ?? config.serviceId,
    status,
    start_at: startAt,
    end_at: endAt,
    ...(config.tenantId ? { tenant_id: config.tenantId } : {}),
    ...(config.venueId ? { venue_id: config.venueId } : {}),
  };
}

export function buildResourceMaintenanceListQuery(config) {
  return {
    service_id: config.serviceId,
    resource_id: config.resourceId,
    active_only: true,
    ...(config.venueId ? { venue_id: config.venueId } : {}),
  };
}

function trimEnvValue(env, name) {
  return env[name]?.trim() ?? "";
}

function validateRequiredEnvNames(requiredEnvNames) {
  const invalidNames = requiredEnvNames.filter((name) => typeof name !== "string" || name.trim().length === 0);
  return invalidNames.length === 0 ? [] : ["live backend parity required env names must be non-empty strings."];
}

function buildConfig(values) {
  return {
    baseUrl: values.RESERVATION_PLATFORM_LIVE_BASE_URL,
    tenantId: values.RESERVATION_PLATFORM_LIVE_TENANT_ID,
    venueId: values.RESERVATION_PLATFORM_LIVE_VENUE_ID,
    apiKey: values.RESERVATION_PLATFORM_LIVE_API_KEY,
    serviceId: values.RESERVATION_PLATFORM_LIVE_SERVICE_ID,
    resourceId: values.RESERVATION_PLATFORM_LIVE_RESOURCE_ID,
    startAt: values.RESERVATION_PLATFORM_LIVE_START_AT,
    endAt: values.RESERVATION_PLATFORM_LIVE_END_AT,
    quantity: Number.parseInt(values.RESERVATION_PLATFORM_LIVE_QUANTITY, 10),
  };
}

export function readLiveBackendParityConfig(env, options = {}) {
  const argv = options.argv ?? [];
  const requiredEnvNames = options.requiredEnvNames ?? liveBackendParityRequiredEnvNames;
  const strict =
    argv.includes("--strict") ||
    trimEnvValue(env, "RESERVATION_PLATFORM_LIVE_STRICT") === "1";
  const allowMutations = trimEnvValue(env, "RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS") === "1";
  const values = Object.fromEntries(requiredEnvNames.map((name) => [name, trimEnvValue(env, name)]));
  values.RESERVATION_PLATFORM_LIVE_VENUE_ID = trimEnvValue(env, "RESERVATION_PLATFORM_LIVE_VENUE_ID");
  values.RESERVATION_PLATFORM_LIVE_QUANTITY = trimEnvValue(env, "RESERVATION_PLATFORM_LIVE_QUANTITY") || "1";
  const missing = requiredEnvNames.filter((name) => values[name].length === 0);
  const configured = requiredEnvNames.filter((name) => values[name].length > 0);
  const errors = validateRequiredEnvNames(requiredEnvNames);

  if (values.RESERVATION_PLATFORM_LIVE_BASE_URL) {
    try {
      const url = new URL(values.RESERVATION_PLATFORM_LIVE_BASE_URL);
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.push("RESERVATION_PLATFORM_LIVE_BASE_URL must use http or https.");
      }
      values.RESERVATION_PLATFORM_LIVE_BASE_URL = url.toString();
    } catch {
      errors.push("RESERVATION_PLATFORM_LIVE_BASE_URL must be an absolute URL.");
    }
  }

  for (const name of ["RESERVATION_PLATFORM_LIVE_START_AT", "RESERVATION_PLATFORM_LIVE_END_AT"]) {
    if (values[name] && Number.isNaN(Date.parse(values[name]))) {
      errors.push(`${name} must be an ISO-compatible date/time string.`);
    }
  }

  if (
    values.RESERVATION_PLATFORM_LIVE_START_AT &&
    values.RESERVATION_PLATFORM_LIVE_END_AT &&
    Date.parse(values.RESERVATION_PLATFORM_LIVE_START_AT) >= Date.parse(values.RESERVATION_PLATFORM_LIVE_END_AT)
  ) {
    errors.push("RESERVATION_PLATFORM_LIVE_START_AT must be before RESERVATION_PLATFORM_LIVE_END_AT.");
  }
  if (!/^[1-9]\d*$/.test(values.RESERVATION_PLATFORM_LIVE_QUANTITY)) {
    errors.push("RESERVATION_PLATFORM_LIVE_QUANTITY must be a positive integer when set.");
  }

  const ready = missing.length === 0 && errors.length === 0;
  let status = "ready";
  let message = "";

  if (errors.length > 0) {
    message = errors.join(" ");
    status = strict ? "fail" : "skip";
  } else if (!ready) {
    const details = [
      `missing ${missing.join(", ")}`,
      configured.length > 0 ? `configured ${configured.join(", ")}` : "no live env configured",
    ].join("; ");
    message = `required live backend config is incomplete: ${details}.`;
    status = strict ? "fail" : "skip";
  } else if (strict && !allowMutations) {
    message = "strict live backend parity requires RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS=1 against a disposable seeded backend.";
    status = "fail";
  }

  return {
    values,
    config: ready ? buildConfig(values) : null,
    missing,
    configured,
    errors,
    strict,
    allowMutations,
    ready,
    mutationReady: ready && strict && allowMutations,
    status,
    shouldSkip: status === "skip",
    shouldFail: status === "fail",
    message,
  };
}

function fail(message) {
  console.error(`FAILED live backend SDK parity verifier: ${message}`);
  process.exitCode = 1;
}

function skip(message) {
  console.log(`SKIPPED live backend SDK parity verifier: ${message}`);
}

function normalize(value) {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entryValue]) => [key, normalize(entryValue)]),
    );
  }
  return value;
}

function assertDeepEqual(label, sdkValue, directValue) {
  const sdkJson = JSON.stringify(normalize(sdkValue));
  const directJson = JSON.stringify(normalize(directValue));
  if (sdkJson !== directJson) {
    throw new Error(`${label} differed between SDK and direct HTTP.\nSDK: ${sdkJson}\nHTTP: ${directJson}`);
  }
}

function assertReservationListed(label, listValue, reservationId) {
  const reservations = Array.isArray(listValue?.reservations) ? listValue.reservations : [];
  if (!reservations.some((reservation) => reservation?.reservation_id === reservationId)) {
    throw new Error(`${label} did not include created reservation ${reservationId}.`);
  }
}

function assertMaintenanceNotActive(label, listValue, maintenanceId) {
  const maintenance = Array.isArray(listValue?.maintenance) ? listValue.maintenance : [];
  if (maintenance.some((entry) => entry?.maintenance_id === maintenanceId)) {
    throw new Error(`${label} still included ended maintenance ${maintenanceId}.`);
  }
}

async function compareReservationList({ client, config, query, label }) {
  const sdkValue = await client.listReservations(query, {
    correlationId: "live-sdk-parity-sdk",
  });
  const directValue = await directGet(config, "/reservations", query);
  assertDeepEqual(label, sdkValue, directValue);
  console.log(`PASS ${label} SDK/direct HTTP parity`);
  return sdkValue;
}

async function compareResourceMaintenanceList({ client, config, query, label }) {
  const sdkValue = await client.listResourceMaintenance(query, {
    correlationId: "live-sdk-parity-sdk",
  });
  const directValue = await directGet(config, "/resource-maintenance", query);
  assertDeepEqual(label, sdkValue, directValue);
  console.log(`PASS ${label} SDK/direct HTTP parity`);
  return sdkValue;
}

function buildUrl(baseUrl, pathName, query) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(`v1/${pathName.replace(/^\/+/, "")}`, normalizedBase);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readJson(response, label) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${label} returned non-JSON status ${response.status}: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(`${label} returned status ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function directGet(config, pathName, query) {
  const url = buildUrl(config.baseUrl, pathName, query);
  const headers = buildDirectHeaders(config, {
    "X-Correlation-Id": "live-sdk-parity-direct",
  });
  const response = await fetch(url, { method: "GET", headers });
  return readJson(response, `GET ${url.pathname}`);
}

async function directPost(config, pathName, body, extraHeaders = {}) {
  const url = buildUrl(config.baseUrl, pathName);
  const headers = buildDirectHeaders(config, {
    ...extraHeaders,
    "Content-Type": "application/json",
  });
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return readJson(response, `POST ${url.pathname}`);
}

function buildDirectHeaders(config, extraHeaders = {}) {
  const headers = {
    Accept: "application/json",
    ...extraHeaders,
  };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  if (config.tenantId) {
    headers["X-Reservation-Tenant-Id"] = config.tenantId;
  }
  if (config.venueId) {
    headers["X-Reservation-Venue-Id"] = config.venueId;
  }
  return headers;
}

async function importSdk() {
  const packagePath = path.join(rootDir, "node_modules", "@reservation-platform", "sdk", "package.json");
  if (existsSync(packagePath)) {
    return import("@reservation-platform/sdk");
  }

  const distPath = path.join(rootDir, "packages", "sdk", "dist", "index.js");
  if (existsSync(distPath)) {
    return import(pathToFileURL(distPath).href);
  }

  throw new Error("Could not import @reservation-platform/sdk. Run corepack pnpm run packages:build first.");
}

async function main() {
  const parsed = readLiveBackendParityConfig(process.env, { argv: process.argv.slice(2) });
  const { strict, allowMutations } = parsed;
  console.log("Live backend SDK parity env contract checked.");

  if (parsed.shouldFail) {
    fail(parsed.message);
    return;
  }
  if (parsed.shouldSkip) {
    skip(`${parsed.message} No live HTTP calls were made.`);
    return;
  }

  const config = parsed.config;
  const { createReservationPlatformClient } = await importSdk();
  const client = createReservationPlatformClient({
    baseUrl: config.baseUrl,
    tenantId: config.tenantId,
    venueId: config.venueId || undefined,
    getAccessToken: () => config.apiKey,
    timeoutMs: 15_000,
    retry: false,
  });
  const availabilityQuery = {
    service_id: config.serviceId,
    start_at: config.startAt,
    end_at: config.endAt,
    quantity: config.quantity,
    resource_ids: [config.resourceId],
    ...(config.venueId ? { venue_id: config.venueId } : {}),
  };

  const checks = [
    ["metadata", () => client.getMetadata({ correlationId: "live-sdk-parity-sdk" }), () => directGet(config, "/metadata")],
    ["service", () => client.getService(config.serviceId, { correlationId: "live-sdk-parity-sdk" }), () => directGet(config, `/services/${encodeURIComponent(config.serviceId)}`)],
    ["resource", () => client.getResource(config.resourceId, { correlationId: "live-sdk-parity-sdk" }), () => directGet(config, `/resources/${encodeURIComponent(config.resourceId)}`)],
    ["availability", () => client.listAvailability(availabilityQuery, { correlationId: "live-sdk-parity-sdk" }), () => directGet(config, "/availability", availabilityQuery)],
  ];

  for (const [label, sdkCall, directCall] of checks) {
    const sdkValue = await sdkCall();
    const directValue = await directCall();
    assertDeepEqual(label, sdkValue, directValue);
    console.log(`PASS ${label} SDK/direct HTTP parity`);
  }

  const seededReservationListQuery = buildReservationListQuery(config);
  await compareReservationList({
    client,
    config,
    query: seededReservationListQuery,
    label: "reservation list/summary",
  });

  if (strict && allowMutations) {
    const idempotencyKey = `live-sdk-parity-${Date.now()}`;
    const reservationInput = {
      service_id: config.serviceId,
      start_at: config.startAt,
      end_at: config.endAt,
      quantity: config.quantity,
      resource_ids: [config.resourceId],
      customer: {
        name: "Live SDK Parity",
        email: "live-sdk-parity@example.invalid",
      },
      source: "live-sdk-parity",
      metadata: {
        proof: "sdk-direct-http-parity",
      },
      ...(config.tenantId ? { tenant_id: config.tenantId } : {}),
      ...(config.venueId ? { venue_id: config.venueId } : {}),
    };
    const sdkCreated = await client.createReservation(reservationInput, {
      correlationId: "live-sdk-parity-sdk",
      idempotencyKey,
    });
    const directReplayed = await directPost(config, "/reservations", reservationInput, {
      "X-Correlation-Id": "live-sdk-parity-direct",
      "Idempotency-Key": idempotencyKey,
    });
    assertDeepEqual("reservation create idempotency replay", sdkCreated, directReplayed);
    console.log("PASS reservation create idempotency replay SDK/direct HTTP parity");

    if (!sdkCreated.reservation_id) {
      throw new Error("reservation create response did not include reservation_id.");
    }

    const sdkRead = await client.getReservation(sdkCreated.reservation_id, {
      correlationId: "live-sdk-parity-sdk",
    });
    const directRead = await directGet(config, `/reservations/${encodeURIComponent(sdkCreated.reservation_id)}`);
    assertDeepEqual("reservation read", sdkRead, directRead);
    console.log("PASS reservation read SDK/direct HTTP parity");

    const createdReservationListQuery = buildReservationListQuery(config, sdkRead);
    const sdkList = await compareReservationList({
      client,
      config,
      query: createdReservationListQuery,
      label: "reservation list/summary after create",
    });
    assertReservationListed("reservation list/summary after create", sdkList, sdkCreated.reservation_id);

    const maintenanceListQuery = buildResourceMaintenanceListQuery(config);
    await compareResourceMaintenanceList({
      client,
      config,
      query: maintenanceListQuery,
      label: "resource-maintenance list before create",
    });

    const maintenanceProofMarker = `live-sdk-parity-maintenance-${Date.now()}`;
    const maintenanceCreateIdempotencyKey = `${maintenanceProofMarker}-create`;
    const maintenanceInput = {
      resource_id: config.resourceId,
      service_id: config.serviceId,
      starts_at: config.startAt,
      ends_at: config.endAt,
      reason: `Live SDK parity resource-maintenance proof ${maintenanceProofMarker}`,
      metadata: {
        proof: "sdk-direct-http-parity",
        proof_surface: "resource-maintenance",
        proof_marker: maintenanceProofMarker,
      },
    };
    let createdMaintenanceId;
    let maintenanceEnded = false;
    const cleanupMaintenance = async () => {
      if (!createdMaintenanceId || maintenanceEnded) {
        return;
      }
      try {
        await client.endResourceMaintenance(
          createdMaintenanceId,
          {
            ended_at: new Date().toISOString(),
            reason: `Cleanup live SDK parity proof ${maintenanceProofMarker}`,
            metadata: {
              proof: "sdk-direct-http-parity",
              proof_surface: "resource-maintenance",
              proof_marker: maintenanceProofMarker,
              cleanup: true,
            },
          },
          {
            correlationId: "live-sdk-parity-cleanup",
            idempotencyKey: `${maintenanceProofMarker}-cleanup`,
          },
        );
        maintenanceEnded = true;
        console.log("PASS resource-maintenance cleanup end completed after failed strict proof step");
      } catch (cleanupError) {
        console.error(
          `WARN resource-maintenance cleanup failed for ${createdMaintenanceId}: ${
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          }`,
        );
      }
    };

    const sdkCreatedMaintenance = await client.createResourceMaintenance(maintenanceInput, {
      correlationId: "live-sdk-parity-sdk",
      idempotencyKey: maintenanceCreateIdempotencyKey,
    });
    if (!sdkCreatedMaintenance.maintenance_id) {
      throw new Error("resource maintenance create response did not include maintenance_id.");
    }
    createdMaintenanceId = sdkCreatedMaintenance.maintenance_id;

    try {
      const directReplayedMaintenance = await directPost(config, "/resource-maintenance", maintenanceInput, {
        "X-Correlation-Id": "live-sdk-parity-direct",
        "Idempotency-Key": maintenanceCreateIdempotencyKey,
      });
      assertDeepEqual("resource-maintenance create idempotency replay", sdkCreatedMaintenance, directReplayedMaintenance);
      console.log("PASS resource-maintenance create idempotency replay SDK/direct HTTP parity");

      const maintenanceEndIdempotencyKey = `${maintenanceProofMarker}-end`;
      const maintenanceEndInput = {
        ended_at: new Date().toISOString(),
        reason: `Ended live SDK parity proof ${maintenanceProofMarker}`,
        metadata: {
          proof: "sdk-direct-http-parity",
          proof_surface: "resource-maintenance",
          proof_marker: maintenanceProofMarker,
        },
      };
      const sdkEndedMaintenance = await client.endResourceMaintenance(
        createdMaintenanceId,
        maintenanceEndInput,
        {
          correlationId: "live-sdk-parity-sdk",
          idempotencyKey: maintenanceEndIdempotencyKey,
        },
      );
      maintenanceEnded = true;
      const directReplayedMaintenanceEnd = await directPost(
        config,
        `/resource-maintenance/${encodeURIComponent(createdMaintenanceId)}/end`,
        maintenanceEndInput,
        {
          "X-Correlation-Id": "live-sdk-parity-direct",
          "Idempotency-Key": maintenanceEndIdempotencyKey,
        },
      );
      assertDeepEqual("resource-maintenance end idempotency replay", sdkEndedMaintenance, directReplayedMaintenanceEnd);
      console.log("PASS resource-maintenance end idempotency replay SDK/direct HTTP parity");
    } catch (error) {
      await cleanupMaintenance();
      throw error;
    }

    const postEndMaintenanceList = await compareResourceMaintenanceList({
      client,
      config,
      query: maintenanceListQuery,
      label: "resource-maintenance list after end",
    });
    assertMaintenanceNotActive("resource-maintenance list after end", postEndMaintenanceList, createdMaintenanceId);
  } else {
    console.log("SKIPPED mutation parity checks because this is not a strict live proof run.");
  }

  console.log("PASS live backend SDK parity verifier completed against configured /v1 backend.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
