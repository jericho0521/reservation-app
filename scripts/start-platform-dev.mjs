#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";

import {
  backendDevEnv,
  formatLocalPlatformDevErrors,
  formatLocalPlatformDevSummary,
  frontendDevEnv,
  readLocalPlatformDevConfig,
} from "./dev-platform-config.mjs";
import { standaloneBackendDevCommand } from "./start-standalone-backend-dev.mjs";

function corepackCommand() {
  if (process.platform !== "win32") {
    return { command: "corepack", prefixArgs: [] };
  }

  return {
    command: process.execPath,
    prefixArgs: [
      join(dirname(process.execPath), "node_modules/corepack/dist/corepack.js"),
    ],
  };
}

function pipeWithPrefix(stream, prefix, target) {
  let pending = "";
  stream.on("data", (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/u);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      target.write(`${prefix} ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (pending) {
      target.write(`${prefix} ${pending}\n`);
    }
  });
}

function spawnPrefixed(name, command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ["inherit", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });
  pipeWithPrefix(child.stdout, `[${name}]`, process.stdout);
  pipeWithPrefix(child.stderr, `[${name}]`, process.stderr);
  return child;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  if (process.platform === "win32" && child.pid) {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        shell: false,
        windowsHide: true,
      });
      killer.on("error", resolve);
      killer.on("exit", resolve);
    });
    return;
  }
  child.kill("SIGTERM");
}

function main() {
  const config = readLocalPlatformDevConfig(process.env, process.argv.slice(2));
  if (!config.ok) {
    console.error(formatLocalPlatformDevErrors(config));
    process.exitCode = 1;
    return;
  }

  console.log("Starting modular reservation platform dev stack.");
  console.log(formatLocalPlatformDevSummary(config));
  console.log("Frontend will run in platform mode against the standalone backend.");

  if (config.checkOnly) {
    return;
  }

  const backend = standaloneBackendDevCommand();
  const backendChild = spawnPrefixed("backend", backend.command, backend.args, {
    cwd: process.cwd(),
    env: backendDevEnv(config),
  });

  const corepack = corepackCommand();
  const frontendChild = spawnPrefixed("frontend", corepack.command, [
    ...corepack.prefixArgs,
    "pnpm",
    "run",
    "dev:frontend",
  ], {
    cwd: process.cwd(),
    env: frontendDevEnv(config),
  });

  let shuttingDown = false;
  const shutdown = async (source) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await Promise.all([stopChild(backendChild), stopChild(frontendChild)]);
    if (source?.code && source.code !== 0) {
      process.exitCode = source.code;
    }
  };

  backendChild.on("error", (error) => {
    console.error(`Failed to start backend dev server: ${error.message}`);
    void shutdown({ code: 1 });
  });
  frontendChild.on("error", (error) => {
    console.error(`Failed to start frontend dev server: ${error.message}`);
    void shutdown({ code: 1 });
  });
  backendChild.on("exit", (code) => void shutdown({ code }));
  frontendChild.on("exit", (code) => void shutdown({ code }));
  process.on("SIGINT", () => void shutdown({ code: 0 }));
  process.on("SIGTERM", () => void shutdown({ code: 0 }));
}

main();
