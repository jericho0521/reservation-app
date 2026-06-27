#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  backendDevEnv,
  formatLocalPlatformDevErrors,
  formatLocalPlatformDevSummary,
  readLocalPlatformDevConfig,
} from "./dev-platform-config.mjs";

export function standaloneBackendDevCommand() {
  return {
    command: process.execPath,
    args: [
      "--import",
      "tsx",
      "apps/api/src/server.ts",
    ],
  };
}

function main() {
  const config = readLocalPlatformDevConfig(process.env, process.argv.slice(2));
  if (!config.ok) {
    console.error(formatLocalPlatformDevErrors(config));
    process.exitCode = 1;
    return;
  }

  console.log("Starting standalone reservation backend dev server.");
  console.log(formatLocalPlatformDevSummary(config));
  console.log("Health check: GET /v1/health");

  if (config.checkOnly) {
    return;
  }

  const { command, args } = standaloneBackendDevCommand();
  const child = spawn(command, args, {
    cwd: join(dirname(fileURLToPath(import.meta.url)), ".."),
    env: backendDevEnv(config),
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });

  child.on("error", (error) => {
    console.error(`Failed to start standalone reservation backend dev server: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
