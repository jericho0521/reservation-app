#!/usr/bin/env node

import { fileURLToPath } from "node:url";

const setupTokenPattern = /^[A-Za-z0-9_-]{43}$/u;
const defaultWaitMilliseconds = 180_000;
const retryMilliseconds = 3_000;

function validateOrigin(value) {
  let origin;
  try {
    origin = new URL(value);
  } catch {
    throw new Error("smoke: --origin must be an HTTPS origin");
  }
  if (
    origin.protocol !== "https:"
    || origin.username
    || origin.password
    || origin.pathname !== "/"
    || origin.search
    || origin.hash
  ) {
    throw new Error("smoke: --origin must be an HTTPS origin");
  }
  return origin.origin;
}

async function readSetupToken() {
  let value = "";
  for await (const chunk of process.stdin) {
    value += chunk;
    if (value.length > 256) throw new Error("smoke: setup token input is invalid");
  }
  value = value.trim();
  if (!setupTokenPattern.test(value)) throw new Error("smoke: setup token input is invalid");
  return value;
}

async function request(fetchImpl, origin, path, label) {
  let response;
  try {
    response = await fetchImpl(new URL(path, origin), {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "reservation-platform-production-smoke" },
    });
  } catch {
    throw new Error(`smoke: ${label} request failed`);
  }
  const body = await response.text();
  return { status: response.status, body };
}

async function attemptSmoke({ origin, setupToken, fetchImpl }) {
  const live = await request(fetchImpl, origin, "/v1/health/live", "liveness");
  if (live.status !== 200) throw new Error(`smoke: /v1/health/live returned ${live.status}`);

  const ready = await request(fetchImpl, origin, "/v1/health/ready", "readiness");
  if (ready.status !== 200) throw new Error(`smoke: /v1/health/ready returned ${ready.status}`);

  const setup = await request(
    fetchImpl,
    origin,
    `/admin/setup?token=${encodeURIComponent(setupToken)}`,
    "setup page",
  );
  if (setup.status !== 200 || !setup.body.includes("Infrastructure is ready")) {
    throw new Error(`smoke: /admin/setup did not return the ready landing page (${setup.status})`);
  }

  const home = await request(fetchImpl, origin, "/", "public root");
  if (home.status !== 200 || !home.body.includes("Open a business booking link.")) {
    throw new Error(`smoke: / did not return the unpublished setup-safe response (${home.status})`);
  }
  if (/apex-racing-demo|final_demo/iu.test(home.body)) {
    throw new Error("smoke: / exposed production demo data");
  }

  for (const path of [
    "/apex-racing-demo",
    "/v1/public/experiences/apex-racing-demo",
  ]) {
    const demo = await request(fetchImpl, origin, path, "demo-slug absence");
    if (demo.status !== 404) throw new Error(`smoke: ${path} must return 404 (received ${demo.status})`);
  }
}

export async function runProductionSmoke({
  origin,
  setupToken,
  fetchImpl = fetch,
  waitMilliseconds = defaultWaitMilliseconds,
  now = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const safeOrigin = validateOrigin(origin);
  if (!setupTokenPattern.test(setupToken)) throw new Error("smoke: setup token input is invalid");
  const deadline = now() + waitMilliseconds;
  let lastError;
  do {
    try {
      await attemptSmoke({ origin: safeOrigin, setupToken, fetchImpl });
      return { origin: safeOrigin, checks: 6 };
    } catch (error) {
      lastError = error;
      if (now() >= deadline) break;
      await sleep(Math.min(retryMilliseconds, Math.max(0, deadline - now())));
    }
  } while (now() <= deadline);
  throw lastError instanceof Error ? lastError : new Error("smoke: production checks failed");
}

function parseArguments(args) {
  let origin;
  let waitSeconds = defaultWaitMilliseconds / 1000;
  let setupTokenFromStdin = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--origin") {
      origin = args[index + 1];
      index += 1;
    } else if (argument === "--wait-seconds") {
      waitSeconds = Number(args[index + 1]);
      index += 1;
    } else if (argument === "--setup-token-stdin") {
      setupTokenFromStdin = true;
    } else {
      throw new Error("smoke: usage: smoke.mjs --origin <https-origin> --setup-token-stdin [--wait-seconds <seconds>]");
    }
  }
  if (!origin || !setupTokenFromStdin || !Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 900) {
    throw new Error("smoke: usage: smoke.mjs --origin <https-origin> --setup-token-stdin [--wait-seconds <seconds>]");
  }
  return { origin, waitMilliseconds: waitSeconds * 1000 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const input = parseArguments(process.argv.slice(2));
    const setupToken = await readSetupToken();
    await runProductionSmoke({ ...input, setupToken });
    process.stdout.write("Production smoke passed: live, ready, setup, unpublished root, and no demo slug.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "smoke: production checks failed"}\n`);
    process.exitCode = 1;
  }
}
