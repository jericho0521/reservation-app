#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const requiredServices = Object.freeze([
  "reservation-config",
  "reservation-db",
  "reservation-migrate",
  "reservation-seed",
  "reservation-rest",
  "reservation-gateway",
  "reservation-api",
  "reservation-worker",
  "reservation-console",
  "reservation-booking",
  "reservation-reset",
  "reservation-destroy",
]);

const requiredVolumes = Object.freeze([
  "reservation-db-data",
  "reservation-stack-config",
  "reservation-whatsapp-sessions",
]);

export function localStackComposeErrors(model) {
  const errors = [];
  const services = model?.services ?? {};
  for (const service of requiredServices) {
    if (!services[service]) errors.push(`Compose is missing ${service}.`);
  }
  for (const volume of requiredVolumes) {
    if (!model?.volumes?.[volume]) errors.push(`Compose is missing ${volume}.`);
  }
  if (model?.networks?.["reservation-stack"]?.internal !== true) {
    errors.push("The reservation-stack network must be internal.");
  }
  assertDependency(services, "reservation-db", "reservation-config", "service_completed_successfully", errors);
  assertDependency(services, "reservation-migrate", "reservation-db", "service_healthy", errors);
  assertDependency(services, "reservation-seed", "reservation-migrate", "service_completed_successfully", errors);
  assertDependency(services, "reservation-api", "reservation-seed", "service_completed_successfully", errors);
  assertDependency(services, "reservation-api", "reservation-gateway", "service_healthy", errors);
  assertDependency(services, "reservation-worker", "reservation-seed", "service_completed_successfully", errors);
  assertDependency(services, "reservation-worker", "reservation-gateway", "service_healthy", errors);
  assertDependency(services, "reservation-console", "reservation-api", "service_healthy", errors);
  assertDependency(services, "reservation-booking", "reservation-api", "service_healthy", errors);

  for (const [name, expectedPort] of [["reservation-api", "4100"], ["reservation-console", "4300"], ["reservation-booking", "4400"]]) {
    const ports = services[name]?.ports ?? [];
    if (ports.length !== 1 || ports[0].host_ip !== "127.0.0.1" || ports[0].published !== expectedPort) {
      errors.push(`${name} must publish only 127.0.0.1:${expectedPort}.`);
    }
  }
  for (const name of ["reservation-db", "reservation-rest", "reservation-gateway", "reservation-worker"]) {
    if ((services[name]?.ports ?? []).length > 0) errors.push(`${name} must not publish a host port.`);
  }
  for (const name of ["reservation-migrate", "reservation-seed", "reservation-rest", "reservation-api", "reservation-worker", "reservation-console", "reservation-booking", "reservation-reset"]) {
    const configMount = (services[name]?.volumes ?? []).find((volume) => volume.source === "reservation-stack-config");
    if (!configMount?.read_only) errors.push(`${name} must mount generated config read-only.`);
  }
  for (const name of ["reservation-reset", "reservation-destroy"]) {
    if (!(services[name]?.profiles ?? []).includes("operations")) errors.push(`${name} must use the operations profile.`);
  }
  if (services["reservation-destroy"]?.network_mode !== "none") {
    errors.push("reservation-destroy must have networking disabled.");
  }
  return errors;
}

export function secretLiteralFindings(sources) {
  const findings = [];
  const jwtPattern = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/gu;
  const literalSecretPattern = /(?:PASSWORD|JWT_SECRET|SERVICE_API_KEY|ENCRYPTION_KEY)\s*[:=]\s*["']?[A-Za-z0-9_-]{32,}["']?/gu;
  for (const source of sources) {
    for (const pattern of [jwtPattern, literalSecretPattern]) {
      if (pattern.test(source.text)) findings.push(`${source.path} contains a usable credential-shaped literal.`);
      pattern.lastIndex = 0;
    }
  }
  return findings;
}

export async function verifyLiveLocalStack() {
  const checks = [
    ["API health", "http://127.0.0.1:4100/v1/health"],
    ["owner console", "http://127.0.0.1:4300/"],
    ["public booking", "http://127.0.0.1:4400/apex-racing-demo"],
  ];
  for (const [label, url] of checks) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`);
  }
  runCompose([
    "run", "--rm", "--no-deps",
    "reservation-migrate",
    "node", "scripts/verify-final-demo-readiness.mjs",
  ]);
  runCompose([
    "run", "--rm", "--no-deps",
    "--entrypoint", "/usr/local/bin/run-with-config",
    "reservation-migrate",
    "/run/reservation-stack/api.env",
    "sh", "-c",
    "curl --fail --silent --output /dev/null -H \"Authorization: Bearer $RESERVATION_PLATFORM_SERVICE_API_KEY\" -H \"X-Reservation-Tenant-Id: final_demo\" -H \"X-Reservation-Venue-Id: 00000000-0000-4000-8000-000000000101\" http://reservation-api:4100/v1/experience/workspace",
  ]);
}

function assertDependency(services, service, dependency, expected, errors) {
  if (services[service]?.depends_on?.[dependency]?.condition !== expected) {
    errors.push(`${service} must depend on ${dependency} with ${expected}.`);
  }
}

function runCompose(args) {
  execFileSync("docker", ["compose", ...args], { stdio: "inherit" });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const model = JSON.parse(execFileSync(
      "docker",
      ["compose", "--profile", "operations", "config", "--format", "json"],
      { encoding: "utf8" },
    ));
    const errors = localStackComposeErrors(model);
    if (errors.length > 0) throw new Error(errors.join("\n"));
    if (process.argv.includes("--live")) {
      await verifyLiveLocalStack();
      console.log("Verified live API, console, booking, demo data, and authenticated owner access.");
    } else {
      console.log("Verified Docker-first local stack topology and safety boundaries.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Local stack verification failed.");
    process.exitCode = 1;
  }
}
