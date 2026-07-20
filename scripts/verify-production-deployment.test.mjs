import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  expectedProductionServices,
  verifyProductionDeployment,
} from "./verify-production-deployment.mjs";

test("production topology exposes only Caddy and contains no development behavior", async () => {
  const compose = await readFile("compose.production.yml", "utf8");
  const result = await verifyProductionDeployment();

  assert.deepEqual(result.services, expectedProductionServices);
  assert.deepEqual(result.publishedServices, ["reservation-edge"]);
  assert.equal(result.externalImagesPinnedByDigest, true);
  assert.doesNotMatch(compose, /reservation-seed:|reservation-reset:|reservation-destroy:/u);
  assert.doesNotMatch(compose, /^\s+build:/mu);
  assert.doesNotMatch(compose, /\.\/:\/app|\.\/:\/workspace|\.\/:\/src/u);
  assert.doesNotMatch(compose, /(?:5432|3000|4100|4300|4400):(?:5432|3000|4100|4300|4400)/u);
  assert.match(compose, /test: \["CMD", "pg_isready", "-h", "127\.0\.0\.1"/u);
  assert.match(compose, /postgrest\/postgrest:v14\.12@sha256:[a-f0-9]{64}/u);
  assert.match(compose, /test: \["CMD", "postgrest", "--ready"\]/u);
  assert.ok(
    compose.indexOf("  reservation-migrate:") < compose.indexOf("  reservation-bootstrap:")
      && compose.indexOf("  reservation-bootstrap:") < compose.indexOf("  reservation-rest:"),
  );
  const bootstrapBlock = compose.slice(
    compose.indexOf("  reservation-bootstrap:"),
    compose.indexOf("  reservation-rest:"),
  );
  assert.match(bootstrapBlock, /reservation-migrate:[\s\S]*condition: service_completed_successfully/u);
  assert.match(bootstrapBlock, /reservation-bootstrap-config:\/run\/reservation-config:ro/u);
  assert.doesNotMatch(bootstrapBlock, /reservation-protected-config/u);
  const restBlock = compose.slice(
    compose.indexOf("  reservation-rest:"),
    compose.indexOf("  reservation-api:"),
  );
  assert.doesNotMatch(restBlock, /test: \[[^\n]*(?:bash|sh|wget|curl)/u);
});

test("production services use scoped secrets and never mount the backup recovery key", async () => {
  const [compose, distributor] = await Promise.all([
    readFile("compose.production.yml", "utf8"),
    readFile("docker/production/configure-entrypoint.sh", "utf8"),
  ]);
  const result = await verifyProductionDeployment();

  assert.equal(result.backupRecoveryKeyMountedToOrdinaryService, false);
  assert.deepEqual(result.secretAllowlistServices, [
    "reservation-api",
    "reservation-bootstrap",
    "reservation-migrate",
    "reservation-worker",
  ]);
  assert.match(compose, /reservation-protected-config:\/run\/reservation-config/u);
  assert.match(compose, /reservation-whatsapp-sessions:\/app\/\.reservation-whatsapp-sessions/u);
  assert.doesNotMatch(distributor, /publish[^\n]*backup-recovery-key/u);
  assert.doesNotMatch(compose, /reservation-console-secrets|console-secret-allowlist|allowlists\/console\.env/u);
  assert.doesNotMatch(distributor, /reservation-console-secrets/u);
  assert.match(distributor, /if \[ -z "\$\(\/bin\/ls -A "\$protected"\)" \]; then\n  chmod 0700 "\$protected"/u);
  assert.match(distributor, /\[ ! -L "\$session_directory" \] \|\| fail/u);
  assert.match(distributor, /chown 1001:1001 "\$session_directory"/u);
  assert.match(distributor, /chmod 0700 "\$session_directory"/u);
  assert.match(distributor, /publish "\$protected\/setup-token" \/run\/reservation-bootstrap-config setup-token 1001 1001/u);
  assert.match(distributor, /publish "\$protected\/installation-id" \/run\/reservation-bootstrap-config installation-id 1001 1001/u);
  assert.match(distributor, /publish "\$protected\/release\.env" \/run\/reservation-bootstrap-config release\.env 1001 1001/u);
  assert.doesNotMatch(distributor, /(?:publish|cp)[^\n]*reservation-whatsapp-sessions/u);
});

test("production assigns encrypted Baileys session ownership only to the worker", async () => {
  const compose = await readFile("compose.production.yml", "utf8");
  const api = compose.slice(compose.indexOf("  reservation-api:"), compose.indexOf("  reservation-worker:"));
  const worker = compose.slice(compose.indexOf("  reservation-worker:"), compose.indexOf("  reservation-console:"));

  assert.match(api, /RESERVATION_WHATSAPP_ENABLED: "false"/u);
  assert.doesNotMatch(api, /reservation-whatsapp-sessions:\/app/u);
  assert.match(worker, /RESERVATION_WHATSAPP_ENABLED: "true"/u);
  assert.match(worker, /RESERVATION_WHATSAPP_PROVIDER: session_qr/u);
  assert.match(worker, /RESERVATION_WHATSAPP_SESSION_AUTH_DIR: \/app\/\.reservation-whatsapp-sessions/u);
  assert.match(worker, /reservation-whatsapp-sessions:\/app\/\.reservation-whatsapp-sessions/u);
  assert.match(worker, /worker-secret-allowlist/u);
  assert.match(worker, /- reservation-egress/u);
  assert.doesNotMatch(worker, /ports:/u);
});

test("Caddy preserves the required route order and security headers", async () => {
  const caddy = await readFile("docker/production/Caddyfile", "utf8");
  const api = caddy.indexOf("handle /v1/*");
  const consoleRoute = caddy.indexOf("handle /admin*");
  const booking = caddy.indexOf("handle {");

  assert.ok(api >= 0 && consoleRoute > api && booking > consoleRoute);
  assert.match(caddy, /reverse_proxy reservation-api:4100/u);
  assert.match(caddy, /reverse_proxy reservation-console:4300/u);
  assert.match(caddy, /reverse_proxy reservation-booking:4400/u);
  assert.match(caddy, /Strict-Transport-Security/u);
  assert.match(caddy, /X-Content-Type-Options/u);
  assert.match(caddy, /Referrer-Policy/u);
});

test("production image targets stay non-root after protected secret loading", async () => {
  const [apiDockerfile, webDockerfile, toolsDockerfile, consoleConfig, dockerignore] = await Promise.all([
    readFile("Dockerfile", "utf8"),
    readFile("Dockerfile.web", "utf8"),
    readFile("Dockerfile.production-tools", "utf8"),
    readFile("apps/console/next.config.ts", "utf8"),
    readFile(".dockerignore", "utf8"),
  ]);

  assert.match(apiDockerfile, /^FROM node:24-alpine AS worker-runtime$/mu);
  assert.match(apiDockerfile, /RESERVATION_RUN_AS_UID=1001/u);
  assert.match(apiDockerfile, /USER reservation/u);
  assert.match(webDockerfile, /^FROM node:24-alpine AS console-runtime$/mu);
  assert.match(webDockerfile, /^FROM node:24-alpine AS booking-runtime$/mu);
  assert.doesNotMatch(webDockerfile, /COPY --from=.*\/src(?:\s|$)/mu);
  assert.match(toolsDockerfile, /COPY --chown=1001:1001 packages\/database\/migrations\/supabase/u);
  assert.match(dockerignore, /^\*\*\/node_modules$/mu);
  assert.match(consoleConfig, /output:\s*"standalone"/u);
  assert.match(consoleConfig, /basePath:\s*"\/admin"/u);
});
