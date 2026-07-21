#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const setupDiagnosticServices = Object.freeze([
  "reservation-config",
  "reservation-db",
  "reservation-migrate",
  "reservation-bootstrap",
]);

export function runLocalStackUp(options = {}) {
  const run = options.run ?? spawnSync;
  const up = run("docker", ["compose", "up", "--build", "-d"], { stdio: "inherit" });
  if (up.error) {
    console.error(`Unable to start Docker Compose: ${up.error.message}`);
    return 1;
  }
  if (up.status === 0) return 0;

  console.error("Local stack startup failed. Setup diagnostics follow:");
  const logs = run(
    "docker",
    ["compose", "logs", "--no-color", "--tail", "200", ...setupDiagnosticServices],
    { stdio: "inherit" },
  );
  if (logs.error) {
    console.error(`Unable to read Docker Compose diagnostics: ${logs.error.message}`);
  }
  return up.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runLocalStackUp();
}
