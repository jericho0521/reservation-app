#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

const files = {
  manifest: "apps/api/deployment.config.json",
  dockerfile: "Dockerfile",
  dockerignore: ".dockerignore",
  envExample: ".env.example",
  compose: "docker-compose.yml",
  localStackConfig: "scripts/local-stack-config.mjs",
  deploymentDocs: "docs/operations/backend-deployment.md",
};

function readText(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assertIncludes(source, expected, message, errors) {
  if (!source.includes(expected)) {
    errors.push(message);
  }
}

function assertMatches(source, pattern, message, errors) {
  if (!pattern.test(source)) {
    errors.push(message);
  }
}

function scanForbiddenPublicEnvNames(manifest, deploymentSources, errors) {
  const forbidden = Array.isArray(manifest.forbiddenPublicEnvPrefixes)
    ? manifest.forbiddenPublicEnvPrefixes
    : [];

  for (const [sourceName, source] of Object.entries(deploymentSources)) {
    for (const prefix of forbidden) {
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const pattern = new RegExp(`\\b${escaped}[A-Z0-9_]*\\b`, "u");
      if (pattern.test(source)) {
        errors.push(`${sourceName} must not contain forbidden public backend secret env prefix ${prefix}.`);
      }
    }
  }
}

function verifyDockerDeploymentFiles() {
  const manifest = readJson(files.manifest);
  const dockerfile = readText(files.dockerfile);
  const dockerignore = readText(files.dockerignore);
  const envExample = readText(files.envExample);
  const compose = readText(files.compose);
  const localStackConfig = readText(files.localStackConfig);
  const deploymentDocs = readText(files.deploymentDocs);
  const errors = [];

  assertIncludes(
    dockerfile,
    `CMD ["node", "apps/api/dist/server.js"]`,
    "Dockerfile must use the standalone API start command from apps/api/deployment.config.json.",
    errors,
  );
  assertIncludes(dockerfile, manifest.healthPath, "Dockerfile healthcheck must call the configured health path.", errors);
  assertIncludes(dockerfile, "USER reservation", "Dockerfile runtime image must run as the non-root reservation user.", errors);
  assertMatches(dockerfile, /^FROM node:24-bookworm-slim@sha256:[a-f0-9]{64} AS runtime-base$/mu, "Dockerfile must include a shared digest-pinned native-runtime-compatible slim stage.", errors);
  assertMatches(dockerfile, /^FROM runtime-base AS runtime$/mu, "Dockerfile API must use the shared slim runtime stage.", errors);
  assertMatches(dockerfile, /^FROM runtime-base AS worker-runtime$/mu, "Dockerfile worker must use the shared ONNX-compatible runtime stage.", errors);
  assertMatches(dockerfile, /pnpm --filter @reservation-platform\/standalone-api-skeleton deploy --prod/u, "Dockerfile must create a pruned API production deployment.", errors);
  assertMatches(dockerfile, /pnpm --filter @reservation-platform\/worker deploy --prod/u, "Dockerfile must create a pruned worker production deployment.", errors);
  if ((dockerfile.match(/RUN pnpm install --frozen-lockfile/gu) ?? []).length !== 1) {
    errors.push("Dockerfile must install the workspace exactly once before building.");
  }
  assertIncludes(dockerfile, "pnpm run build", "Dockerfile build stage must compile backend packages and apps/api.", errors);
  assertIncludes(
    dockerfile,
    "/app/deploy/api ./apps/api",
    "Dockerfile runtime image must copy the self-contained API production deployment.",
    errors,
  );

  assertIncludes(dockerignore, ".env", ".dockerignore must exclude local env files.", errors);
  assertIncludes(dockerignore, "node_modules", ".dockerignore must exclude local node_modules.", errors);
  assertIncludes(dockerignore, ".git", ".dockerignore must exclude git metadata.", errors);
  assertIncludes(dockerignore, ".superpowers", ".dockerignore must exclude local Superpowers state.", errors);
  assertIncludes(dockerignore, "dist-packages", ".dockerignore must exclude packaged release artifacts.", errors);

  for (const envName of manifest.requiredSupabaseEnv ?? []) {
    assertMatches(
      envExample,
      new RegExp(`^${envName}=`, "mu"),
      `.env.example must document required Supabase env ${envName}.`,
      errors,
    );
    assertIncludes(
      localStackConfig,
      `${envName}:`,
      `Docker-contained local configuration must generate backend Supabase env ${envName}.`,
      errors,
    );
  }

  const authAlternatives = Array.isArray(manifest.authEnvAlternatives) ? manifest.authEnvAlternatives : [];
  const documentedAuthAlternative = authAlternatives.some((alternative) =>
    alternative.every((envName) => new RegExp(`^${envName}=`, "mu").test(envExample)),
  );
  if (!documentedAuthAlternative) {
    errors.push(".env.example must document at least one complete backend auth option.");
  }

  assertIncludes(compose, "reservation-api:", "docker-compose.yml must define the reservation-api service.", errors);
  assertIncludes(compose, 'target: runtime', "docker-compose.yml must build the Dockerfile runtime target.", errors);
  assertIncludes(compose, '"127.0.0.1:4100:4100"', "docker-compose.yml must bind API port 4100 to localhost.", errors);
  assertIncludes(compose, 'PORT: "4100"', "docker-compose.yml must set the container PORT for the API server.", errors);
  assertIncludes(
    localStackConfig,
    "RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS",
    "Docker-contained local configuration must set exact backend CORS origins.",
    errors,
  );
  assertIncludes(
    envExample,
    "RESERVATION_PLATFORM_CONFIG_PATH=",
    ".env.example must document the backend module manifest path.",
    errors,
  );
  assertIncludes(
    compose,
    '"/usr/local/bin/run-with-config", "/run/reservation-stack/api.env"',
    "docker-compose.yml must load generated API config from the private stack volume.",
    errors,
  );
  assertIncludes(
    compose,
    "reservation-whatsapp-sessions:/app/.reservation-whatsapp-sessions",
    "docker-compose.yml must persist WhatsApp session auth state.",
    errors,
  );
  assertIncludes(compose, manifest.healthPath, "docker-compose.yml healthcheck must call the configured health path.", errors);

  assertIncludes(deploymentDocs, manifest.healthPath, "docs/operations/backend-deployment.md must document the health path.", errors);
  assertIncludes(
    deploymentDocs,
    "RESERVATION_PLATFORM_CONFIG_PATH",
    "docs/operations/backend-deployment.md must document the backend module manifest path.",
    errors,
  );
  assertMatches(
    deploymentDocs,
    /does not apply migrations on startup/iu,
    "docs/operations/backend-deployment.md must state that migrations are not auto-run at container startup.",
    errors,
  );
  assertIncludes(
    deploymentDocs,
    "NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL",
    "docs/operations/backend-deployment.md must document the frontend public backend URL.",
    errors,
  );
  assertIncludes(
    deploymentDocs,
    "pnpm run docker:build",
    "docs/operations/backend-deployment.md must document the Docker build script.",
    errors,
  );

  scanForbiddenPublicEnvNames(
    manifest,
    {
      [files.dockerfile]: dockerfile,
      [files.envExample]: envExample,
      [files.compose]: compose,
      [files.deploymentDocs]: deploymentDocs,
    },
    errors,
  );

  return errors;
}

const errors = verifyDockerDeploymentFiles();

if (errors.length > 0) {
  console.error("FAILED Docker deployment file verification:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("Verified Docker deployment files.");
}
