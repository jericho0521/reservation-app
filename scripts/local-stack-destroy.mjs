#!/usr/bin/env node

import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const requiredVolumeNames = Object.freeze(["database", "config", "whatsapp"]);

export function assertDestroyConfirmation(env = process.env) {
  if (env.RESERVATION_STACK_DESTROY_CONFIRM !== "DESTROY_LOCAL_STACK") {
    throw new Error("Set RESERVATION_STACK_DESTROY_CONFIRM=DESTROY_LOCAL_STACK to destroy local stack data.");
  }
}

export async function clearLocalStackVolumeContents(root = "/volumes") {
  const resolvedRoot = await realpath(root);
  for (const name of requiredVolumeNames) {
    const volumePath = path.join(resolvedRoot, name);
    const file = await lstat(volumePath);
    if (!file.isDirectory() || file.isSymbolicLink()) {
      throw new Error(`Local stack volume mount ${name} is not a real directory.`);
    }
    const resolvedVolume = await realpath(volumePath);
    if (path.dirname(resolvedVolume) !== resolvedRoot) {
      throw new Error(`Local stack volume mount ${name} resolves outside the fixed volume root.`);
    }
    const entries = await readdir(resolvedVolume);
    for (const entry of entries) {
      await rm(path.join(resolvedVolume, entry), { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assertDestroyConfirmation();
    await clearLocalStackVolumeContents();
    console.log("Local stack data destroyed.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Local stack destroy failed.");
    process.exitCode = 1;
  }
}
