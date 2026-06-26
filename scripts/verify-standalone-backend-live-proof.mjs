#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const standaloneBackendLiveProofBaseUrlEnvName = "RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL";
export const standaloneBackendLiveProofHealthPathEnvName = "RESERVATION_STANDALONE_BACKEND_LIVE_HEALTH_PATH";
export const standaloneBackendLiveProofStrictEnvName = "RESERVATION_STANDALONE_BACKEND_LIVE_PROOF_STRICT";
export const standaloneBackendLiveProofTimeoutMsEnvName = "RESERVATION_STANDALONE_BACKEND_LIVE_TIMEOUT_MS";
export const defaultStandaloneBackendLiveProofHealthPath = "/v1/health";
export const defaultStandaloneBackendLiveProofTimeoutMs = 5_000;
export const maxStandaloneBackendLiveProofTimeoutMs = 60_000;
export const standaloneBackendHealthContractBody = {
  status: "ok",
  service: "standalone-api-skeleton",
  api_version: "v1",
  readiness: "alive",
};

const requiredEnvNames = [standaloneBackendLiveProofBaseUrlEnvName];
const optionalEnvNames = [
  standaloneBackendLiveProofHealthPathEnvName,
  standaloneBackendLiveProofTimeoutMsEnvName,
];

function trimEnvValue(env, name) {
  return typeof env[name] === "string" ? env[name].trim() : "";
}

function hasEnvValue(env, name) {
  return Object.prototype.hasOwnProperty.call(env, name) && env[name] !== undefined;
}

function configuredEnvNames(env) {
  return [
    ...requiredEnvNames,
    ...optionalEnvNames,
  ].filter((name) => hasEnvValue(env, name) && trimEnvValue(env, name).length > 0);
}

function validateBaseUrl(value, errors) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      errors.push(`${standaloneBackendLiveProofBaseUrlEnvName} must use http or https.`);
    }
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    errors.push(`${standaloneBackendLiveProofBaseUrlEnvName} must be an absolute URL.`);
    return value;
  }
}

function validateHealthPath(value, errors) {
  const path = value || defaultStandaloneBackendLiveProofHealthPath;

  if (!path.startsWith("/")) {
    errors.push(`${standaloneBackendLiveProofHealthPathEnvName} must start with "/".`);
    return path;
  }
  if (path.startsWith("//")) {
    errors.push(`${standaloneBackendLiveProofHealthPathEnvName} must be a path, not a protocol-relative URL.`);
    return path;
  }
  try {
    const url = new URL(path, "https://standalone-backend.example.test");
    if (url.origin !== "https://standalone-backend.example.test") {
      errors.push(`${standaloneBackendLiveProofHealthPathEnvName} must be a relative path, not an absolute URL.`);
    }
    return `${url.pathname}${url.search}`;
  } catch {
    errors.push(`${standaloneBackendLiveProofHealthPathEnvName} must be a valid URL path.`);
    return path;
  }
}

function validateTimeoutMs(value, errors) {
  if (!value) {
    return defaultStandaloneBackendLiveProofTimeoutMs;
  }
  if (!/^[1-9]\d*$/.test(value)) {
    errors.push(`${standaloneBackendLiveProofTimeoutMsEnvName} must be a positive integer when set.`);
    return defaultStandaloneBackendLiveProofTimeoutMs;
  }

  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs > maxStandaloneBackendLiveProofTimeoutMs) {
    errors.push(
      `${standaloneBackendLiveProofTimeoutMsEnvName} must be between 1 and ${maxStandaloneBackendLiveProofTimeoutMs} when set.`,
    );
    return defaultStandaloneBackendLiveProofTimeoutMs;
  }
  return timeoutMs;
}

export function buildStandaloneBackendHealthUrl(baseUrl, healthPath = defaultStandaloneBackendLiveProofHealthPath) {
  const url = new URL(baseUrl);
  const pathUrl = new URL(healthPath, "https://standalone-backend.example.test");
  const basePath = url.pathname.replace(/\/+$/u, "");
  const healthUrl = new URL(url.toString());
  healthUrl.pathname = `${basePath}${pathUrl.pathname}`.replace(/\/{2,}/gu, "/");
  healthUrl.search = pathUrl.search;
  healthUrl.hash = "";
  return healthUrl;
}

function buildConfig(values) {
  const healthUrl = buildStandaloneBackendHealthUrl(
    values[standaloneBackendLiveProofBaseUrlEnvName],
    values[standaloneBackendLiveProofHealthPathEnvName],
  );

  return {
    baseUrl: values[standaloneBackendLiveProofBaseUrlEnvName],
    healthPath: values[standaloneBackendLiveProofHealthPathEnvName],
    healthUrl: healthUrl.toString(),
    timeoutMs: values[standaloneBackendLiveProofTimeoutMsEnvName],
  };
}

export function readStandaloneBackendLiveProofConfig(env, options = {}) {
  const argv = options.argv ?? [];
  const strict =
    argv.includes("--strict") ||
    trimEnvValue(env, standaloneBackendLiveProofStrictEnvName) === "1";
  const errors = [];
  const values = {
    [standaloneBackendLiveProofBaseUrlEnvName]: validateBaseUrl(
      trimEnvValue(env, standaloneBackendLiveProofBaseUrlEnvName),
      errors,
    ),
    [standaloneBackendLiveProofHealthPathEnvName]: validateHealthPath(
      trimEnvValue(env, standaloneBackendLiveProofHealthPathEnvName),
      errors,
    ),
    [standaloneBackendLiveProofTimeoutMsEnvName]: validateTimeoutMs(
      trimEnvValue(env, standaloneBackendLiveProofTimeoutMsEnvName),
      errors,
    ),
  };
  const missing = requiredEnvNames.filter((name) => values[name].length === 0);
  const configured = configuredEnvNames(env);
  const ready = missing.length === 0 && errors.length === 0;
  let status = "ready";
  let message = "";

  if (errors.length > 0) {
    status = strict ? "fail" : "skip";
    message = errors.join(" ");
  } else if (!ready) {
    const details = [
      `missing ${missing.join(", ")}`,
      configured.length > 0 ? `configured ${configured.join(", ")}` : "no standalone backend live proof env configured",
    ].join("; ");
    status = strict ? "fail" : "skip";
    message = `required standalone backend live proof config is incomplete: ${details}.`;
  }

  return {
    values,
    config: ready ? buildConfig(values) : null,
    missing,
    configured,
    errors,
    strict,
    ready,
    status,
    shouldSkip: status === "skip",
    shouldFail: status === "fail",
    message,
  };
}

function responseHeader(response, name) {
  if (typeof response.headers?.get === "function") {
    return response.headers.get(name);
  }
  const lowerName = name.toLowerCase();
  return response.headers?.[name] ?? response.headers?.[lowerName] ?? "";
}

async function readJsonResponse(response, label) {
  const contentType = responseHeader(response, "content-type") ?? "";
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${label} returned non-JSON content-type ${contentType}.`);
  }

  const text = typeof response.text === "function"
    ? await response.text()
    : JSON.stringify(await response.json());
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${label} returned non-JSON status ${response.status}: ${text.slice(0, 200)}`);
  }
}

function validateStandaloneHealthBody(body, label) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${label} returned malformed standalone health body: expected a JSON object.`);
  }

  const expectedKeys = Object.keys(standaloneBackendHealthContractBody);
  for (const [key, expectedValue] of Object.entries(standaloneBackendHealthContractBody)) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) {
      errors.push(`missing ${key}`);
      continue;
    }
    if (body[key] !== expectedValue) {
      errors.push(`${key} must be ${JSON.stringify(expectedValue)}`);
    }
  }
  for (const key of Object.keys(body)) {
    if (!expectedKeys.includes(key)) {
      errors.push(`unexpected ${key}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`${label} returned malformed standalone health body: ${errors.join(", ")}.`);
  }
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Reservation-Proof": "standalone-backend-live-health",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyStandaloneBackendLiveProof(env, options = {}) {
  const parsed = readStandaloneBackendLiveProofConfig(env, options);

  if (parsed.shouldFail || parsed.shouldSkip) {
    return {
      ...parsed,
      ok: false,
      proof: null,
    };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return {
      ...parsed,
      ok: false,
      status: "fail",
      shouldFail: true,
      message: "global fetch is not available for standalone backend live proof.",
      proof: null,
    };
  }

  try {
    const response = await fetchWithTimeout(fetchImpl, parsed.config.healthUrl, parsed.config.timeoutMs);
    const body = await readJsonResponse(response, `GET ${parsed.config.healthUrl}`);
    if (!response.ok) {
      return {
        ...parsed,
        ok: false,
        status: "fail",
        shouldFail: true,
        message: `GET ${parsed.config.healthUrl} returned status ${response.status}: ${JSON.stringify(body)}`,
        proof: {
          status: response.status,
          ok: response.ok,
          body,
        },
      };
    }
    validateStandaloneHealthBody(body, `GET ${parsed.config.healthUrl}`);

    return {
      ...parsed,
      ok: true,
      proof: {
        status: response.status,
        ok: response.ok,
        body,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...parsed,
      ok: false,
      status: "fail",
      shouldFail: true,
      message,
      proof: null,
    };
  }
}

function fail(message) {
  console.error(`FAILED standalone backend live health proof: ${message}`);
  process.exitCode = 1;
}

function skip(message) {
  console.log(`SKIPPED standalone backend live health proof: ${message}`);
}

async function main() {
  const parsed = await verifyStandaloneBackendLiveProof(process.env, { argv: process.argv.slice(2) });
  console.log("Standalone backend live health proof env contract checked.");
  console.log("This health/readiness proof targets a configured standalone backend URL only.");
  console.log("It is not a database, RLS, idempotency, SDK/direct parity, or compatibility-route proof.");

  if (parsed.shouldFail) {
    fail(parsed.message);
    return;
  }
  if (parsed.shouldSkip) {
    skip(`${parsed.message} No live HTTP call was made.`);
    return;
  }

  console.log(`PASS standalone backend health endpoint responded with ${parsed.proof.status}: ${parsed.config.healthUrl}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
