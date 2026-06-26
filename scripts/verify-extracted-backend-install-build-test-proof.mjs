#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, "..");

export const extractedBackendProofRootEnvName = "RESERVATION_EXTRACTED_BACKEND_PROOF_ROOT";
export const extractedBackendProofAllowInstallEnvName = "RESERVATION_EXTRACTED_BACKEND_PROOF_ALLOW_INSTALL";
export const extractedBackendProofStrictEnvName = "RESERVATION_EXTRACTED_BACKEND_PROOF_STRICT";

export const expectedGeneratedBackendWorkspaceScript =
  "corepack pnpm run backend-platform:verify-extraction-boundary && corepack pnpm run packages:build && corepack pnpm run packages:test && corepack pnpm run backend-platform:verify-standalone-api-skeleton && corepack pnpm run database:migration-index:check";
const defaultModeBackendSafetyMessage =
  "Default mode does not install dependencies, call the network, publish packages, or execute generated backend commands.";

export const extractedBackendInstallProofAllowlistedSteps = Object.freeze([
  Object.freeze({
    id: "install-dependencies",
    label: "Install extracted backend dependencies from its lockfile without lifecycle scripts",
    command: "corepack",
    args: Object.freeze(["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"]),
  }),
  Object.freeze({
    id: "verify-generated-backend-workspace",
    label: "Run generated backend workspace build/test verifier",
    command: "corepack",
    args: Object.freeze(["pnpm", "run", "phase-11:verify-generated-backend-workspace"]),
  }),
]);

function trimEnvValue(env, name) {
  return typeof env[name] === "string" ? env[name].trim() : "";
}

function hasEnvValue(env, name) {
  return Object.prototype.hasOwnProperty.call(env, name) && env[name] !== undefined;
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function realpathNative(filePath) {
  return realpathSync.native ? realpathSync.native(filePath) : realpathSync(filePath);
}

function formatStep(step) {
  return [step.command, ...step.args].join(" ");
}

export function buildExtractedBackendInstallProofSteps(root) {
  return extractedBackendInstallProofAllowlistedSteps.map((step) => ({
    ...step,
    args: [...step.args],
    cwd: root,
    displayCommand: formatStep(step),
  }));
}

function readPackageJson(root, errors) {
  const packageJsonPath = path.join(root, "package.json");
  if (!existsSync(packageJsonPath)) {
    errors.push("prepared extracted backend root must contain package.json.");
    return null;
  }

  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    errors.push(
      `prepared extracted backend package.json must be valid JSON (${error instanceof Error ? error.message : error}).`,
    );
    return null;
  }
}

function validatePreparedRoot(root, repoRoot, errors) {
  if (!path.isAbsolute(root)) {
    errors.push(`${extractedBackendProofRootEnvName} must be an absolute path to a prepared extracted backend workspace.`);
    return null;
  }

  const resolvedRoot = path.resolve(root);

  if (isPathInside(repoRoot, resolvedRoot)) {
    errors.push(`${extractedBackendProofRootEnvName} must point outside the current repository workspace.`);
  }

  let rootStat = null;
  try {
    rootStat = lstatSync(resolvedRoot);
  } catch {
    errors.push(`${extractedBackendProofRootEnvName} must point to an existing prepared extracted backend workspace.`);
    return resolvedRoot;
  }

  if (!rootStat.isDirectory()) {
    errors.push(`${extractedBackendProofRootEnvName} must point to a directory.`);
    return resolvedRoot;
  }

  try {
    const realRepoRoot = realpathNative(repoRoot);
    const realRoot = realpathNative(resolvedRoot);
    if (isPathInside(realRepoRoot, realRoot)) {
      errors.push(`${extractedBackendProofRootEnvName} must point outside the current repository workspace after resolving symlinks and junctions.`);
    }
  } catch (error) {
    errors.push(
      `${extractedBackendProofRootEnvName} real filesystem path could not be resolved (${error instanceof Error ? error.message : error}).`,
    );
  }

  if (!existsSync(path.join(resolvedRoot, "pnpm-lock.yaml"))) {
    errors.push("prepared extracted backend root must contain pnpm-lock.yaml for --frozen-lockfile install proof.");
  }

  const packageJson = readPackageJson(resolvedRoot, errors);
  const phase11Script = packageJson?.scripts?.["phase-11:verify-generated-backend-workspace"];
  if (phase11Script !== expectedGeneratedBackendWorkspaceScript) {
    errors.push(
      "prepared extracted backend package.json must define the generated phase-11:verify-generated-backend-workspace script exactly as produced by the Phase 11 dry-run metadata.",
    );
  }

  return resolvedRoot;
}

export function readExtractedBackendInstallProofConfig(env, options = {}) {
  const argv = options.argv ?? [];
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const strict =
    argv.includes("--strict") ||
    trimEnvValue(env, extractedBackendProofStrictEnvName) === "1";
  const rootValue = trimEnvValue(env, extractedBackendProofRootEnvName);
  const allowInstall = trimEnvValue(env, extractedBackendProofAllowInstallEnvName) === "1";
  const errors = [];
  const missing = rootValue ? [] : [extractedBackendProofRootEnvName];

  if (
    hasEnvValue(env, extractedBackendProofAllowInstallEnvName) &&
    trimEnvValue(env, extractedBackendProofAllowInstallEnvName) !== "1"
  ) {
    errors.push(`${extractedBackendProofAllowInstallEnvName} must be 1 when set.`);
  }

  const resolvedRoot = rootValue
    ? validatePreparedRoot(rootValue, repoRoot, errors)
    : null;

  const configured = [
    extractedBackendProofRootEnvName,
    extractedBackendProofAllowInstallEnvName,
  ].filter((name) => hasEnvValue(env, name) && trimEnvValue(env, name).length > 0);
  const ready = missing.length === 0 && errors.length === 0;
  const plannedSteps = ready ? buildExtractedBackendInstallProofSteps(resolvedRoot) : [];
  let status = "ready";
  let message = "";

  if (errors.length > 0) {
    status = strict ? "fail" : "skip";
    message = errors.join(" ");
  } else if (!ready) {
    const details = [
      `missing ${missing.join(", ")}`,
      configured.length > 0 ? `configured ${configured.join(", ")}` : "no extracted backend install proof env configured",
    ].join("; ");
    status = strict ? "fail" : "skip";
    message = `required extracted backend install/build/test proof config is incomplete: ${details}.`;
  } else if (strict && !allowInstall) {
    status = "fail";
    message = `extracted backend install/build/test proof is configured for ${resolvedRoot}, but ${extractedBackendProofAllowInstallEnvName}=1 is required before install or generated backend commands run.`;
  } else if (!strict) {
    message = `prepared extracted backend workspace config is valid; default mode only reports the static allowlisted proof plan. ${defaultModeBackendSafetyMessage}`;
  }

  return {
    values: {
      [extractedBackendProofRootEnvName]: resolvedRoot ?? rootValue,
      [extractedBackendProofAllowInstallEnvName]: trimEnvValue(env, extractedBackendProofAllowInstallEnvName),
    },
    config: ready ? { root: resolvedRoot } : null,
    repoRoot,
    missing,
    configured,
    errors,
    strict,
    allowInstall,
    ready,
    runReady: ready && strict && allowInstall,
    plannedSteps,
    status,
    shouldSkip: status === "skip",
    shouldFail: status === "fail",
    shouldRun: ready && strict && allowInstall,
    message,
  };
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const executable = process.platform === "win32" && command === "corepack"
      ? process.execPath
      : command;
    const executableArgs = process.platform === "win32" && command === "corepack"
      ? [path.join(path.dirname(process.execPath), "node_modules/corepack/dist/corepack.js"), ...args]
      : args;
    const child = spawn(executable, executableArgs, {
      ...options,
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${signal ?? code}`));
    });
  });
}

export async function verifyExtractedBackendInstallBuildTestProof(env, options = {}) {
  const parsed = readExtractedBackendInstallProofConfig(env, options);

  if (!parsed.shouldRun) {
    return {
      ...parsed,
      ok: parsed.status !== "fail",
      executedSteps: [],
    };
  }

  const runner = options.runner ?? runProcess;
  const executedSteps = [];
  for (const step of parsed.plannedSteps) {
    await runner(step.command, step.args, {
      cwd: step.cwd,
      env: {
        ...process.env,
        npm_config_audit: "false",
        npm_config_fund: "false",
      },
      stdio: "inherit",
    });
    executedSteps.push(step);
  }

  return {
    ...parsed,
    ok: true,
    executedSteps,
  };
}

function fail(message) {
  console.error(`FAILED extracted backend install/build/test proof: ${message}`);
  process.exitCode = 1;
}

function printPlannedSteps(plannedSteps) {
  for (const step of plannedSteps) {
    console.log(`- ${step.displayCommand} (cwd: ${step.cwd})`);
  }
}

async function main() {
  const result = await verifyExtractedBackendInstallBuildTestProof(process.env, {
    argv: process.argv.slice(2),
  });
  console.log("Extracted backend install/build/test proof env contract checked.");
  console.log("Allowlisted proof steps:");
  printPlannedSteps(result.plannedSteps.length > 0
    ? result.plannedSteps
    : buildExtractedBackendInstallProofSteps("<prepared extracted backend root>"));

  if (result.shouldFail) {
    fail(result.message);
    return;
  }
  if (result.shouldSkip) {
    console.log(`SKIPPED extracted backend install/build/test proof: ${result.message} ${defaultModeBackendSafetyMessage}`);
    return;
  }
  if (!result.shouldRun) {
    console.log(`READY extracted backend install/build/test proof: ${result.message}`);
    return;
  }

  console.log(`PASS extracted backend install/build/test proof ran ${result.executedSteps.length} static allowlisted install/verifier steps.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
