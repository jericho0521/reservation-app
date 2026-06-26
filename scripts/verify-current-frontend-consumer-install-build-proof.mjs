#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  generatedFrontendConsumerScripts,
  validateGeneratedFrontendConsumerScripts,
} from "./verify-current-frontend-consumer-repo-readiness.mjs";

export { generatedFrontendConsumerScripts } from "./verify-current-frontend-consumer-repo-readiness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, "..");

export const currentFrontendConsumerProofRootEnvName = "CURRENT_FRONTEND_CONSUMER_PROOF_ROOT";
export const currentFrontendConsumerProofAllowInstallEnvName =
  "CURRENT_FRONTEND_CONSUMER_PROOF_ALLOW_INSTALL";
export const currentFrontendConsumerProofStrictEnvName =
  "CURRENT_FRONTEND_CONSUMER_PROOF_STRICT";

export const currentFrontendConsumerInstallProofAllowlistedSteps = Object.freeze([
  Object.freeze({
    id: "install-dependencies",
    label: "Install prepared frontend consumer dependencies from its lockfile without lifecycle scripts",
    command: "corepack",
    args: Object.freeze(["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"]),
  }),
  Object.freeze({
    id: "typecheck",
    label: "Run prepared frontend consumer typecheck script",
    command: "corepack",
    args: Object.freeze(["pnpm", "run", "typecheck"]),
  }),
  Object.freeze({
    id: "build",
    label: "Run prepared frontend consumer build script",
    command: "corepack",
    args: Object.freeze(["pnpm", "run", "build"]),
  }),
]);

const forbiddenDependencySpecPrefixes = ["workspace:", "file:", "link:", "portal:"];
const defaultModeFrontendSafetyMessage =
  "Default mode does not install dependencies, call the network, publish packages, start a dev server, open a browser, or execute generated frontend commands.";

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

export function buildCurrentFrontendConsumerInstallProofSteps(root) {
  return currentFrontendConsumerInstallProofAllowlistedSteps.map((step) => ({
    ...step,
    args: [...step.args],
    cwd: root,
    displayCommand: formatStep(step),
  }));
}

function readPackageJson(root, errors) {
  const packageJsonPath = path.join(root, "package.json");
  if (!existsSync(packageJsonPath)) {
    errors.push("prepared frontend consumer root must contain package.json.");
    return null;
  }

  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    errors.push(
      `prepared frontend consumer package.json must be valid JSON (${error instanceof Error ? error.message : error}).`,
    );
    return null;
  }
}

function validateGeneratedScripts(packageJson, errors) {
  const failures = [];
  validateGeneratedFrontendConsumerScripts(packageJson?.scripts, failures);

  errors.push(...new Set(failures));
}

const installRelevantDependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

function validateNoLocalDependencySpecs(packageJson, errors) {
  for (const sectionName of installRelevantDependencySections) {
    const section = packageJson?.[sectionName];
    if (section === undefined) {
      continue;
    }
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      errors.push(`prepared frontend consumer package.json ${sectionName} must be an object when present.`);
      continue;
    }

    for (const [dependencyName, spec] of Object.entries(section)) {
      if (typeof spec !== "string") {
        errors.push(`prepared frontend consumer package.json ${sectionName}.${dependencyName} spec must be a string.`);
        continue;
      }
      const matchingPrefix = forbiddenDependencySpecPrefixes.find((prefix) => spec.startsWith(prefix));
      if (matchingPrefix) {
        errors.push(
          `prepared frontend consumer package.json ${sectionName}.${dependencyName} must not use ${matchingPrefix} dependency specs.`,
        );
      }
    }
  }
}

function validatePreparedRoot(root, repoRoot, errors) {
  if (!path.isAbsolute(root)) {
    errors.push(`${currentFrontendConsumerProofRootEnvName} must be an absolute path to a prepared frontend consumer workspace.`);
    return null;
  }

  const resolvedRoot = path.resolve(root);

  if (isPathInside(repoRoot, resolvedRoot)) {
    errors.push(`${currentFrontendConsumerProofRootEnvName} must point outside the current repository workspace.`);
  }

  let rootStat = null;
  try {
    rootStat = lstatSync(resolvedRoot);
  } catch {
    errors.push(`${currentFrontendConsumerProofRootEnvName} must point to an existing prepared frontend consumer workspace.`);
    return resolvedRoot;
  }

  if (!rootStat.isDirectory()) {
    errors.push(`${currentFrontendConsumerProofRootEnvName} must point to a directory.`);
    return resolvedRoot;
  }

  try {
    const realRepoRoot = realpathNative(repoRoot);
    const realRoot = realpathNative(resolvedRoot);
    if (isPathInside(realRepoRoot, realRoot)) {
      errors.push(`${currentFrontendConsumerProofRootEnvName} must point outside the current repository workspace after resolving symlinks and junctions.`);
    }
  } catch (error) {
    errors.push(
      `${currentFrontendConsumerProofRootEnvName} real filesystem path could not be resolved (${error instanceof Error ? error.message : error}).`,
    );
  }

  if (!existsSync(path.join(resolvedRoot, "pnpm-lock.yaml"))) {
    errors.push("prepared frontend consumer root must contain pnpm-lock.yaml for --frozen-lockfile install proof.");
  }

  const packageJson = readPackageJson(resolvedRoot, errors);
  if (packageJson) {
    validateGeneratedScripts(packageJson, errors);
    validateNoLocalDependencySpecs(packageJson, errors);
  }

  return resolvedRoot;
}

export function readCurrentFrontendConsumerInstallProofConfig(env, options = {}) {
  const argv = options.argv ?? [];
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const strict =
    argv.includes("--strict") ||
    trimEnvValue(env, currentFrontendConsumerProofStrictEnvName) === "1";
  const rootValue = trimEnvValue(env, currentFrontendConsumerProofRootEnvName);
  const allowInstall = trimEnvValue(env, currentFrontendConsumerProofAllowInstallEnvName) === "1";
  const errors = [];
  const missing = rootValue ? [] : [currentFrontendConsumerProofRootEnvName];

  if (
    hasEnvValue(env, currentFrontendConsumerProofAllowInstallEnvName) &&
    trimEnvValue(env, currentFrontendConsumerProofAllowInstallEnvName) !== "1"
  ) {
    errors.push(`${currentFrontendConsumerProofAllowInstallEnvName} must be 1 when set.`);
  }

  const resolvedRoot = rootValue
    ? validatePreparedRoot(rootValue, repoRoot, errors)
    : null;

  const configured = [
    currentFrontendConsumerProofRootEnvName,
    currentFrontendConsumerProofAllowInstallEnvName,
  ].filter((name) => hasEnvValue(env, name) && trimEnvValue(env, name).length > 0);
  const ready = missing.length === 0 && errors.length === 0;
  const plannedSteps = ready ? buildCurrentFrontendConsumerInstallProofSteps(resolvedRoot) : [];
  let status = "ready";
  let message = "";

  if (errors.length > 0) {
    status = strict ? "fail" : "skip";
    message = errors.join(" ");
  } else if (!ready) {
    const details = [
      `missing ${missing.join(", ")}`,
      configured.length > 0 ? `configured ${configured.join(", ")}` : "no frontend consumer install proof env configured",
    ].join("; ");
    status = strict ? "fail" : "skip";
    message = `required frontend consumer install/build proof config is incomplete: ${details}.`;
  } else if (strict && !allowInstall) {
    status = "fail";
    message = `frontend consumer install/build proof is configured for ${resolvedRoot}, but ${currentFrontendConsumerProofAllowInstallEnvName}=1 is required before install or generated frontend commands run.`;
  } else if (!strict) {
    message = `prepared frontend consumer workspace config is valid; default mode only reports the static allowlisted proof plan. ${defaultModeFrontendSafetyMessage}`;
  }

  return {
    values: {
      [currentFrontendConsumerProofRootEnvName]: resolvedRoot ?? rootValue,
      [currentFrontendConsumerProofAllowInstallEnvName]: trimEnvValue(env, currentFrontendConsumerProofAllowInstallEnvName),
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
    const child = spawn(command, args, {
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

export async function verifyCurrentFrontendConsumerInstallBuildProof(env, options = {}) {
  const parsed = readCurrentFrontendConsumerInstallProofConfig(env, options);

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
  console.error(`FAILED frontend consumer install/build proof: ${message}`);
  process.exitCode = 1;
}

function printPlannedSteps(plannedSteps) {
  for (const step of plannedSteps) {
    console.log(`- ${step.displayCommand} (cwd: ${step.cwd})`);
  }
}

async function main() {
  const result = await verifyCurrentFrontendConsumerInstallBuildProof(process.env, {
    argv: process.argv.slice(2),
  });
  console.log("Current frontend consumer install/build proof env contract checked.");
  console.log("Allowlisted proof steps:");
  printPlannedSteps(result.plannedSteps.length > 0
    ? result.plannedSteps
    : buildCurrentFrontendConsumerInstallProofSteps("<prepared frontend consumer root>"));

  if (result.shouldFail) {
    fail(result.message);
    return;
  }
  if (result.shouldSkip) {
    console.log(`SKIPPED frontend consumer install/build proof: ${result.message} ${defaultModeFrontendSafetyMessage}`);
    return;
  }
  if (!result.shouldRun) {
    console.log(`READY frontend consumer install/build proof: ${result.message}`);
    return;
  }

  console.log(`PASS frontend consumer install/build proof ran ${result.executedSteps.length} static allowlisted install/typecheck/build steps.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
