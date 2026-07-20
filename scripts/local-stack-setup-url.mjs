#!/usr/bin/env node

import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const setupTokenPattern = /^[A-Za-z0-9_-]{43}$/u;

export async function readLocalSetupUrl(
  directory = process.env.RESERVATION_STACK_CONFIG_DIR?.trim() || "/run/reservation-stack",
) {
  const [mode, token] = await Promise.all([
    readProtectedFile(path.join(directory, "stack-mode")),
    readProtectedFile(path.join(directory, "setup-token")),
  ]);
  if (mode.trim() !== "product") {
    throw new Error("The browser setup URL is available only for the product stack.");
  }
  const normalizedToken = token.trim();
  if (!setupTokenPattern.test(normalizedToken)) {
    throw new Error("The local setup capability is invalid.");
  }
  return `http://127.0.0.1:4300/admin/setup?token=${normalizedToken}`;
}

async function readProtectedFile(filePath) {
  const state = await lstat(filePath);
  if (!state.isFile() || state.isSymbolicLink() || (state.mode & 0o077) !== 0) {
    throw new Error(`Local stack ${path.basename(filePath)} must be a protected regular file.`);
  }
  return readFile(filePath, "utf8");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  readLocalSetupUrl().then(
    (url) => process.stdout.write(`${url}\n`),
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Unable to read the local setup URL."}\n`);
      process.exitCode = 1;
    },
  );
}
