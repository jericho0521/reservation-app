#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const keyResult = spawnSync("docker", [
  "compose",
  "run",
  "--rm",
  "--no-deps",
  "--entrypoint",
  "/usr/local/bin/run-with-config",
  "reservation-migrate",
  "/run/reservation-stack/api.env",
  "sh",
  "-c",
  'printf %s "$RESERVATION_PLATFORM_SERVICE_API_KEY"',
], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

if (keyResult.error || keyResult.status !== 0 || !keyResult.stdout.trim()) {
  console.error("Unable to read the local stack smoke credential inside Docker.");
  process.exit(1);
}

const testResult = spawnSync("pnpm", ["run", "test:smoke"], {
  env: {
    ...process.env,
    RESERVATION_SMOKE_API_KEY: keyResult.stdout.trim(),
    RESERVATION_SMOKE_BACKEND_BASE_URL: "http://127.0.0.1:4100",
    RESERVATION_SMOKE_STRICT: "1",
  },
  stdio: "inherit",
});

if (testResult.error) {
  console.error(`Unable to run local stack smoke tests: ${testResult.error.message}`);
  process.exit(1);
}
process.exit(testResult.status ?? 1);
