#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const sharedServices = Object.freeze([
  "reservation-config",
  "reservation-db",
  "reservation-migrate",
  "reservation-bootstrap",
  "reservation-rest",
  "reservation-gateway",
  "reservation-api",
  "reservation-worker",
  "reservation-console",
  "reservation-booking",
  "reservation-setup-url",
  "reservation-destroy",
]);

const requiredVolumes = Object.freeze([
  "reservation-db-data",
  "reservation-stack-config",
  "reservation-whatsapp-sessions",
]);

export function localStackComposeErrors(model, options = {}) {
  const mode = options.mode ?? "product";
  const errors = [];
  const services = model?.services ?? {};
  for (const service of [...sharedServices, ...(mode === "demo" ? ["reservation-reset"] : [])]) {
    if (!services[service]) errors.push(`Compose is missing ${service}.`);
  }
  if (mode === "product" && services["reservation-reset"]) {
    errors.push("Product Compose must not expose the demo reset service.");
  }
  for (const volume of requiredVolumes) {
    if (!model?.volumes?.[volume]) errors.push(`Compose is missing ${volume}.`);
  }
  if (model?.networks?.["reservation-stack"]?.internal !== true) {
    errors.push("The reservation-stack network must be internal.");
  }
  if (!Object.hasOwn(services["reservation-worker"]?.networks ?? {}, "reservation-edge")) {
    errors.push("The reservation-worker must have outbound network access for live channel delivery.");
  }
  assertDependency(services, "reservation-db", "reservation-config", "service_completed_successfully", errors);
  assertDependency(services, "reservation-migrate", "reservation-db", "service_healthy", errors);
  assertDependency(services, "reservation-bootstrap", "reservation-migrate", "service_completed_successfully", errors);
  assertDependency(services, "reservation-api", "reservation-bootstrap", "service_completed_successfully", errors);
  assertDependency(services, "reservation-api", "reservation-gateway", "service_healthy", errors);
  assertDependency(services, "reservation-worker", "reservation-bootstrap", "service_completed_successfully", errors);
  assertDependency(services, "reservation-worker", "reservation-gateway", "service_healthy", errors);
  assertDependency(services, "reservation-console", "reservation-api", "service_healthy", errors);
  assertDependency(services, "reservation-booking", "reservation-api", "service_healthy", errors);

  const configMode = services["reservation-config"]?.environment?.RESERVATION_STACK_MODE;
  if (configMode !== mode) errors.push(`reservation-config must generate ${mode} mode.`);
  const bootstrapCommand = JSON.stringify(services["reservation-bootstrap"]?.command ?? []);
  if (mode === "product" && !bootstrapCommand.includes("local-stack-bootstrap.mjs")) {
    errors.push("Product Compose must use the installation bootstrap.");
  }
  if (mode === "demo" && !bootstrapCommand.includes("local-stack-seed.mjs")) {
    errors.push("Demo Compose must use the final demo seed.");
  }
  const bookingHealthcheck = JSON.stringify(services["reservation-booking"]?.healthcheck?.test ?? []);
  if (mode === "product" && /apex-racing-demo/iu.test(bookingHealthcheck)) {
    errors.push("Product booking health must not depend on a seeded demo slug.");
  }

  for (const [name, expectedPort] of [["reservation-api", "4100"], ["reservation-console", "4300"], ["reservation-booking", "4400"]]) {
    const ports = services[name]?.ports ?? [];
    if (ports.length !== 1 || ports[0].host_ip !== "127.0.0.1" || ports[0].published !== expectedPort) {
      errors.push(`${name} must publish only 127.0.0.1:${expectedPort}.`);
    }
  }
  for (const name of ["reservation-db", "reservation-rest", "reservation-gateway", "reservation-worker"]) {
    if ((services[name]?.ports ?? []).length > 0) errors.push(`${name} must not publish a host port.`);
  }
  for (const name of [
    "reservation-migrate",
    "reservation-bootstrap",
    "reservation-rest",
    "reservation-api",
    "reservation-worker",
    "reservation-console",
    "reservation-booking",
    "reservation-setup-url",
    ...(mode === "demo" ? ["reservation-reset"] : []),
  ]) {
    const configMount = (services[name]?.volumes ?? []).find((volume) => volume.source.endsWith("reservation-stack-config"));
    if (!configMount?.read_only) errors.push(`${name} must mount generated config read-only.`);
  }
  for (const name of ["reservation-setup-url", "reservation-destroy", ...(mode === "demo" ? ["reservation-reset"] : [])]) {
    if (!(services[name]?.profiles ?? []).includes("operations")) errors.push(`${name} must use the operations profile.`);
  }
  for (const name of ["reservation-setup-url", "reservation-destroy"]) {
    if (services[name]?.network_mode !== "none") errors.push(`${name} must have networking disabled.`);
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

export async function verifyLiveLocalStack(options = {}) {
  const mode = options.mode ?? "product";
  const composeArgs = composeFileArgs(mode);
  const checks = [
    ["API health", "http://127.0.0.1:4100/v1/health"],
    ["owner console", "http://127.0.0.1:4300/"],
    ["public booking", mode === "demo" ? "http://127.0.0.1:4400/apex-racing-demo" : "http://127.0.0.1:4400/"],
  ];
  for (const [label, url] of checks) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`);
  }

  if (mode === "demo") {
    runCompose(composeArgs, [
      "run", "--rm", "--no-deps",
      "reservation-migrate",
      "node", "scripts/verify-final-demo-readiness.mjs",
    ]);
    return;
  }

  const counts = runCompose(composeArgs, [
    "exec", "-T", "reservation-db", "psql", "-X", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", "reservation", "--tuples-only", "--no-align",
    "--command", [
      "select count(*) from public.platform_installation where singleton = true;",
      "select count(*) from public.tenants;",
      "select count(*) from public.tenants where id = 'final_demo';",
      "select count(*) from public.venues;",
    ].join(" "),
  ], { encoding: "utf8" }).trim().split(/\s+/u).map(Number);
  if (counts[0] !== 1 || counts[1] !== 1 || counts[2] !== 0 || counts[3] > 1) {
    throw new Error(`Product stack has an invalid single-business state: ${counts.join(",")}.`);
  }
}

function assertDependency(services, service, dependency, expected, errors) {
  if (services[service]?.depends_on?.[dependency]?.condition !== expected) {
    errors.push(`${service} must depend on ${dependency} with ${expected}.`);
  }
}

function composeFileArgs(mode) {
  return mode === "demo"
    ? ["-f", "docker-compose.yml", "-f", "docker-compose.demo.yml"]
    : [];
}

function runCompose(composeArgs, args, options = {}) {
  return execFileSync("docker", ["compose", ...composeArgs, ...args], {
    stdio: options.encoding ? ["ignore", "pipe", "inherit"] : "inherit",
    ...options,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv.includes("--demo") ? "demo" : "product";
    const composeArgs = composeFileArgs(mode);
    const model = JSON.parse(execFileSync(
      "docker",
      ["compose", ...composeArgs, "--profile", "operations", "config", "--format", "json"],
      { encoding: "utf8" },
    ));
    const errors = localStackComposeErrors(model, { mode });
    if (errors.length > 0) throw new Error(errors.join("\n"));
    if (process.argv.includes("--live")) {
      await verifyLiveLocalStack({ mode });
      console.log(mode === "demo"
        ? "Verified live seeded demo stack."
        : "Verified live blank-or-configured single-business product stack.");
    } else {
      console.log(`Verified Docker-first ${mode} stack topology and safety boundaries.`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Local stack verification failed.");
    process.exitCode = 1;
  }
}
