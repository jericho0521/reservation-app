#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const expectedProductionServices = Object.freeze([
  "reservation-config",
  "reservation-db",
  "reservation-migrate",
  "reservation-bootstrap",
  "reservation-rest",
  "reservation-api",
  "reservation-worker",
  "reservation-console",
  "reservation-booking",
  "reservation-edge",
  "reservation-operations",
]);

const externalImagePatterns = Object.freeze([
  /^\s+image: postgres:16-alpine@sha256:[a-f0-9]{64}$/mu,
  /^\s+image: postgrest\/postgrest:v14\.12@sha256:[a-f0-9]{64}$/mu,
  /^\s+image: caddy:2\.10\.0-alpine@sha256:[a-f0-9]{64}$/mu,
]);

export async function verifyProductionDeployment(options = {}) {
  const root = options.root ?? repoRoot;
  const [compose, caddy, postgrest, dockerfile, toolsDockerfile, webDockerfile, consoleConfig, packageJson] = await Promise.all([
    readFile(path.join(root, "compose.production.yml"), "utf8"),
    readFile(path.join(root, "docker/production/Caddyfile"), "utf8"),
    readFile(path.join(root, "docker/production/postgrest.conf"), "utf8"),
    readFile(path.join(root, "Dockerfile"), "utf8"),
    readFile(path.join(root, "Dockerfile.production-tools"), "utf8"),
    readFile(path.join(root, "Dockerfile.web"), "utf8"),
    readFile(path.join(root, "apps/console/next.config.ts"), "utf8"),
    readFile(path.join(root, "package.json"), "utf8"),
  ]);
  const errors = [];
  const serviceBlocks = extractServiceBlocks(compose);
  const services = [...serviceBlocks.keys()];
  const publishedServices = services.filter((service) => /^    ports:\s*$/mu.test(serviceBlocks.get(service)));
  const secretAllowlistServices = services
    .filter((service) => /\/etc\/reservation-secrets\/[a-z-]+\.env/u.test(serviceBlocks.get(service)))
    .sort();

  expect(
    JSON.stringify(services) === JSON.stringify(expectedProductionServices),
    `Production services must be exactly: ${expectedProductionServices.join(", ")}.`,
    errors,
  );
  expect(
    JSON.stringify(publishedServices) === JSON.stringify(["reservation-edge"]),
    "Only reservation-edge may publish host ports.",
    errors,
  );
  expect(/- "80:80"/u.test(serviceBlocks.get("reservation-edge") ?? ""), "Caddy must publish TCP port 80.", errors);
  expect(/- "443:443"/u.test(serviceBlocks.get("reservation-edge") ?? ""), "Caddy must publish TCP port 443.", errors);
  expect(!/^\s+build:/mu.test(compose), "Production Compose must not build images from source.", errors);
  expect(!/reservation-(?:seed|reset|destroy):/u.test(compose), "Production Compose must not contain seed/reset/destroy services.", errors);
  expect(!/image:\s*\S+:latest(?:\s|$)/u.test(compose), "Production Compose must not use latest image tags.", errors);
  expect(
    !/^[ \t]+-\s+\.\/?[^:]*:\/(?:app|workspace|src)(?:\/|\s|$)/mu.test(compose),
    "Production Compose must not bind-mount repository source.",
    errors,
  );

  const externalImagesPinnedByDigest = externalImagePatterns.every((pattern) => pattern.test(compose));
  expect(externalImagesPinnedByDigest, "PostgreSQL, PostgREST, and Caddy must be pinned by digest.", errors);
  for (const variable of ["TOOLS", "API", "WORKER", "CONSOLE", "BOOKING"]) {
    expect(
      compose.includes(`image: \${RESERVATION_${variable}_IMAGE:?`),
      `Production Compose must require RESERVATION_${variable}_IMAGE.`,
      errors,
    );
  }

  for (const service of ["reservation-db", "reservation-rest", "reservation-api", "reservation-worker", "reservation-console", "reservation-booking", "reservation-edge"]) {
    expect(/restart: unless-stopped/u.test(serviceBlocks.get(service) ?? ""), `${service} must restart unless stopped.`, errors);
  }
  for (const service of ["reservation-config", "reservation-migrate", "reservation-bootstrap", "reservation-operations"]) {
    expect(/restart: "no"/u.test(serviceBlocks.get(service) ?? ""), `${service} must be one-shot.`, errors);
  }
  expect(
    /condition: service_completed_successfully/u.test(serviceBlocks.get("reservation-db") ?? ""),
    "Database startup must wait for protected configuration.",
    errors,
  );
  expect(
    /condition: service_healthy/u.test(serviceBlocks.get("reservation-api") ?? ""),
    "API startup must wait for healthy PostgREST.",
    errors,
  );
  expect(
    /reservation-backend:\n    internal: true/u.test(compose)
      && /reservation-edge:\n    internal: true/u.test(compose),
    "Database and application networks must stay internal.",
    errors,
  );

  const protectedConfigurationServices = new Set(["reservation-config", "reservation-operations"]);
  const backupRecoveryKeyMountedToOrdinaryService = [...serviceBlocks.entries()]
    .some(([service, block]) => !protectedConfigurationServices.has(service) && /backup-recovery-key/u.test(block));
  expect(!backupRecoveryKeyMountedToOrdinaryService, "Backup recovery key must not reach ordinary services.", errors);
  expect(
    /reservation-protected-config:\/run\/reservation-config/u.test(serviceBlocks.get("reservation-config") ?? ""),
    "Only the config service must mount the complete protected configuration.",
    errors,
  );
  for (const [service, block] of serviceBlocks) {
    if (!protectedConfigurationServices.has(service)) {
      expect(!/reservation-protected-config/u.test(block), `${service} must not mount the complete protected configuration.`, errors);
    }
  }
  expect(
    /profiles: \["operations"\]/u.test(serviceBlocks.get("reservation-operations") ?? "")
      && /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock/u.test(serviceBlocks.get("reservation-operations") ?? ""),
    "Recovery authority must be isolated in the explicit operations profile.",
    errors,
  );
  expect(
    JSON.stringify(secretAllowlistServices) === JSON.stringify([
      "reservation-api",
      "reservation-bootstrap",
      "reservation-migrate",
      "reservation-worker",
    ]),
    "Secret-consuming application services must use explicit allowlists.",
    errors,
  );
  expect(
    /reservation-migrate:[\s\S]*condition: service_completed_successfully/u.test(serviceBlocks.get("reservation-bootstrap") ?? ""),
    "Installation bootstrap must run after successful migrations.",
    errors,
  );
  expect(
    /reservation-bootstrap:[\s\S]*condition: service_completed_successfully/u.test(serviceBlocks.get("reservation-rest") ?? ""),
    "PostgREST must wait for successful installation bootstrap.",
    errors,
  );
  expect(
    /reservation-bootstrap-config:\/run\/reservation-config:ro/u.test(serviceBlocks.get("reservation-bootstrap") ?? ""),
    "Installation bootstrap must receive only its scoped protected files.",
    errors,
  );
  for (const service of secretAllowlistServices) {
    const block = serviceBlocks.get(service) ?? "";
    expect(/RESERVATION_RUN_AS_UID: "1001"/u.test(block), `${service} must drop to UID 1001.`, errors);
    expect(/RESERVATION_RUN_AS_GID: "1001"/u.test(block), `${service} must drop to GID 1001.`, errors);
  }
  expect(
    !/reservation-console-secrets|console-secret-allowlist|allowlists\/console\.env/u.test(compose),
    "The console must not mount or publish a service API key.",
    errors,
  );

  expectOrdered(caddy, ["handle /v1/*", "handle /admin*", "handle {"], "Caddy route order", errors);
  for (const expected of [
    "reverse_proxy reservation-api:4100",
    "reverse_proxy reservation-console:4300",
    "reverse_proxy reservation-booking:4400",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "Referrer-Policy",
  ]) {
    expect(caddy.includes(expected), `Caddyfile must include ${expected}.`, errors);
  }
  expect(/db-uri = "@\/run\/reservation-secrets\/database-uri"/u.test(postgrest), "PostgREST must load its database URI from a file.", errors);
  expect(/jwt-secret = "@\/run\/reservation-secrets\/postgrest-jwt-secret"/u.test(postgrest), "PostgREST must load its JWT secret from a file.", errors);
  expect(
    /test: \["CMD", "postgrest", "--ready"\]/u.test(serviceBlocks.get("reservation-rest") ?? ""),
    "PostgREST healthcheck must use its platform-independent native readiness command.",
    errors,
  );
  expect(
    /test: \["CMD", "pg_isready", "-h", "127\.0\.0\.1"/u.test(serviceBlocks.get("reservation-db") ?? ""),
    "Database healthcheck must probe the final TCP listener instead of the temporary init socket.",
    errors,
  );

  expect(/^FROM node:24-alpine AS worker-runtime$/mu.test(dockerfile), "Dockerfile must include worker-runtime.", errors);
  expect(/USER reservation/u.test(dockerfile), "API and worker images must default to non-root.", errors);
  expect(/^FROM node:24-alpine AS console-runtime$/mu.test(webDockerfile), "Dockerfile.web must include console-runtime.", errors);
  expect(/^FROM node:24-alpine AS booking-runtime$/mu.test(webDockerfile), "Dockerfile.web must include booking-runtime.", errors);
  expect((webDockerfile.match(/USER reservation/gu) ?? []).length >= 2, "Both web images must run as non-root.", errors);
  expect(/output:\s*"standalone"/u.test(consoleConfig), "Console must use standalone output.", errors);
  expect(/basePath:\s*"\/admin"/u.test(consoleConfig), "Console must preserve the /admin base path.", errors);
  expect(
    /^FROM node:20\.19\.4-alpine3\.22@sha256:[a-f0-9]{64}$/mu.test(toolsDockerfile),
    "Production tools must use the digest-pinned Alpine base.",
    errors,
  );
  for (const packagePattern of [
    /^\s+age\s*\\?$/mu,
    /^\s+bash\s*\\?$/mu,
    /^\s+docker-cli\s*\\?$/mu,
    /^\s+docker-cli-compose\s*\\?$/mu,
    /^\s+postgresql16-client=/mu,
    /^\s+su-exec=/mu,
    /^\s+tar\s*$/mu,
  ]) {
    expect(packagePattern.test(toolsDockerfile), "Production tools image is missing a required apk package boundary.", errors);
  }

  const scripts = JSON.parse(packageJson).scripts ?? {};
  expect(scripts["production:verify"] === "node scripts/verify-production-deployment.mjs", "production:verify script is missing.", errors);
  expect(scripts["production:config:test"] === "node --test scripts/production/configure.test.mjs", "production:config:test script is missing.", errors);
  expect(scripts["production:compose:check"] === "docker compose -f compose.production.yml config --quiet", "production:compose:check script is missing.", errors);

  if (errors.length > 0) {
    throw new Error(`Production deployment verification failed:\n- ${errors.join("\n- ")}`);
  }
  return {
    services,
    publishedServices,
    secretAllowlistServices,
    externalImagesPinnedByDigest,
    backupRecoveryKeyMountedToOrdinaryService,
  };
}

function extractServiceBlocks(compose) {
  const servicesStart = compose.indexOf("services:\n");
  const servicesEnd = compose.indexOf("\nconfigs:\n", servicesStart);
  if (servicesStart < 0 || servicesEnd < 0) return new Map();
  const section = compose.slice(servicesStart + "services:\n".length, servicesEnd);
  const matches = [...section.matchAll(/^  ([a-z][a-z0-9-]+):\s*$/gmu)];
  return new Map(matches.map((match, index) => {
    const start = match.index;
    const end = matches[index + 1]?.index ?? section.length;
    return [match[1], section.slice(start, end)];
  }));
}

function expect(condition, message, errors) {
  if (!condition) errors.push(message);
}

function expectOrdered(source, values, label, errors) {
  let prior = -1;
  for (const value of values) {
    const position = source.indexOf(value);
    if (position <= prior) {
      errors.push(`${label} must be ${values.join(" then ")}.`);
      return;
    }
    prior = position;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyProductionDeployment();
    process.stdout.write(`Verified production deployment topology (${result.services.length} services; edge-only publishing).\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Production deployment verification failed."}\n`);
    process.exitCode = 1;
  }
}
