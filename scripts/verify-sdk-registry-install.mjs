#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

export const sdkRegistryProofModeEnvName = "RESERVATION_SDK_REGISTRY_PROOF_MODE";
export const sdkRegistryPackageSpecsEnvName = "RESERVATION_SDK_REGISTRY_PACKAGE_SPECS";
export const sdkRegistryAllowInstallEnvName = "RESERVATION_SDK_REGISTRY_ALLOW_INSTALL";
export const sdkRegistryRequiredPrivateEnvNames = [
  "RESERVATION_SDK_REGISTRY_PRIVATE_URL",
  "RESERVATION_SDK_REGISTRY_PRIVATE_TOKEN",
  sdkRegistryPackageSpecsEnvName,
];
export const sdkRegistryRequiredPublicEnvNames = [sdkRegistryPackageSpecsEnvName];

const npmPackageNameSegmentPattern = "(?![._])[a-z0-9][a-z0-9._~-]*";
const npmPackageNamePattern = `(?:${npmPackageNameSegmentPattern}|@${npmPackageNameSegmentPattern}/${npmPackageNameSegmentPattern})`;
const exactVersionSpecPattern = new RegExp(
  `^${npmPackageNamePattern}@\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$`,
);

function trimEnvValue(env, name) {
  return env[name]?.trim() ?? "";
}

function splitPackageSpecs(value) {
  return value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function modeRequiredEnvNames(mode) {
  if (mode === "private") {
    return sdkRegistryRequiredPrivateEnvNames;
  }
  if (mode === "public") {
    return sdkRegistryRequiredPublicEnvNames;
  }
  return [];
}

function validatePackageSpecs(specs) {
  const errors = [];
  if (specs.length === 0) {
    errors.push(`${sdkRegistryPackageSpecsEnvName} must include at least one exact package@version spec.`);
    return errors;
  }

  if (!specs.some((spec) => spec.startsWith("@reservation-platform/sdk@"))) {
    errors.push(`${sdkRegistryPackageSpecsEnvName} must include @reservation-platform/sdk at an exact version.`);
  }
  if (!specs.some((spec) => spec.startsWith("@reservation-platform/contract-types@"))) {
    errors.push(`${sdkRegistryPackageSpecsEnvName} must include @reservation-platform/contract-types at an exact version.`);
  }

  for (const spec of specs) {
    if (
      spec.includes("workspace:") ||
      spec.includes("file:") ||
      spec.includes("link:") ||
      spec.includes("portal:")
    ) {
      errors.push(`${sdkRegistryPackageSpecsEnvName} must not use workspace, file, link, or portal specs: ${spec}.`);
      continue;
    }
    if (!exactVersionSpecPattern.test(spec)) {
      errors.push(`${sdkRegistryPackageSpecsEnvName} entries must be exact package@version specs: ${spec}.`);
    }
  }

  return errors;
}

function parsePackageManager(value) {
  const packageManager = value || "pnpm";
  if (packageManager !== "pnpm" && packageManager !== "npm") {
    return {
      packageManager,
      error: "RESERVATION_SDK_REGISTRY_PACKAGE_MANAGER must be pnpm or npm when set.",
    };
  }
  return { packageManager, error: "" };
}

function privateRegistryAuthLine(registryUrl, token) {
  const url = new URL(registryUrl);
  const pathName = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return `//${url.host}${pathName}:_authToken=${token}`;
}

function buildConfig(values, packageSpecs, packageManager) {
  return {
    mode: values.RESERVATION_SDK_REGISTRY_PROOF_MODE,
    packageSpecs,
    packageManager,
    privateRegistryUrl: values.RESERVATION_SDK_REGISTRY_PRIVATE_URL,
    keepTemp: values.RESERVATION_SDK_REGISTRY_KEEP_TEMP === "1",
  };
}

export function readSdkRegistryInstallConfig(env, options = {}) {
  const argv = options.argv ?? [];
  const strict =
    argv.includes("--strict") ||
    trimEnvValue(env, "RESERVATION_SDK_REGISTRY_STRICT") === "1";
  const mode = trimEnvValue(env, sdkRegistryProofModeEnvName);
  const allowInstall = trimEnvValue(env, sdkRegistryAllowInstallEnvName) === "1";
  const packageSpecs = splitPackageSpecs(trimEnvValue(env, sdkRegistryPackageSpecsEnvName));
  const rawPackageManager = trimEnvValue(env, "RESERVATION_SDK_REGISTRY_PACKAGE_MANAGER");
  const { packageManager, error: packageManagerError } = parsePackageManager(rawPackageManager);
  const values = {
    RESERVATION_SDK_REGISTRY_PROOF_MODE: mode,
    RESERVATION_SDK_REGISTRY_PRIVATE_URL: trimEnvValue(env, "RESERVATION_SDK_REGISTRY_PRIVATE_URL"),
    RESERVATION_SDK_REGISTRY_PRIVATE_TOKEN: trimEnvValue(env, "RESERVATION_SDK_REGISTRY_PRIVATE_TOKEN"),
    RESERVATION_SDK_REGISTRY_PACKAGE_SPECS: trimEnvValue(env, sdkRegistryPackageSpecsEnvName),
    RESERVATION_SDK_REGISTRY_PACKAGE_MANAGER: packageManager,
    RESERVATION_SDK_REGISTRY_KEEP_TEMP: trimEnvValue(env, "RESERVATION_SDK_REGISTRY_KEEP_TEMP"),
  };
  const errors = [];

  if (packageManagerError) {
    errors.push(packageManagerError);
  }

  if (mode && mode !== "private" && mode !== "public") {
    errors.push(`${sdkRegistryProofModeEnvName} must be private or public when set.`);
  }

  if (values.RESERVATION_SDK_REGISTRY_PRIVATE_URL) {
    try {
      const url = new URL(values.RESERVATION_SDK_REGISTRY_PRIVATE_URL);
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.push("RESERVATION_SDK_REGISTRY_PRIVATE_URL must use http or https.");
      }
      values.RESERVATION_SDK_REGISTRY_PRIVATE_URL = url.toString();
    } catch {
      errors.push("RESERVATION_SDK_REGISTRY_PRIVATE_URL must be an absolute URL.");
    }
  }

  if (values.RESERVATION_SDK_REGISTRY_KEEP_TEMP && values.RESERVATION_SDK_REGISTRY_KEEP_TEMP !== "1") {
    errors.push("RESERVATION_SDK_REGISTRY_KEEP_TEMP must be 1 when set.");
  }

  const requiredEnvNames = modeRequiredEnvNames(mode);
  const missing = mode ? requiredEnvNames.filter((name) => values[name].length === 0) : [sdkRegistryProofModeEnvName];
  const configured = [
    sdkRegistryProofModeEnvName,
    ...sdkRegistryRequiredPrivateEnvNames,
    "RESERVATION_SDK_REGISTRY_PACKAGE_MANAGER",
    sdkRegistryAllowInstallEnvName,
  ].filter((name) => {
    if (name === sdkRegistryAllowInstallEnvName) {
      return trimEnvValue(env, name).length > 0;
    }
    if (name === "RESERVATION_SDK_REGISTRY_PACKAGE_MANAGER") {
      return rawPackageManager.length > 0;
    }
    return values[name]?.length > 0;
  });

  if (mode === "private" || mode === "public") {
    errors.push(...validatePackageSpecs(packageSpecs));
  }

  const ready = mode !== "" && missing.length === 0 && errors.length === 0;
  let status = "ready";
  let message = "";

  if (errors.length > 0) {
    message = errors.join(" ");
    status = strict ? "fail" : "skip";
  } else if (!ready) {
    const details = [
      `missing ${missing.join(", ")}`,
      configured.length > 0 ? `configured ${configured.join(", ")}` : "no registry proof env configured",
    ].join("; ");
    message = `required SDK registry install proof config is incomplete: ${details}.`;
    status = strict ? "fail" : "skip";
  } else if (!allowInstall) {
    message = `SDK registry install proof is configured for ${mode}, but ${sdkRegistryAllowInstallEnvName}=1 is required before any external install.`;
    status = strict ? "fail" : "skip";
  }

  return {
    values,
    config: ready ? buildConfig(values, packageSpecs, packageManager) : null,
    mode,
    packageSpecs,
    packageManager,
    requiredEnvNames,
    missing,
    configured,
    errors,
    strict,
    allowInstall,
    ready,
    installReady: ready && allowInstall,
    status,
    shouldSkip: status === "skip",
    shouldFail: status === "fail",
    message,
  };
}

function fail(message) {
  console.error(`FAILED SDK registry install proof: ${message}`);
  process.exitCode = 1;
}

function skip(message) {
  console.log(`SKIPPED SDK registry install proof: ${message}`);
}

function buildInstallCommand(config) {
  if (config.packageManager === "npm") {
    return {
      command: "npm",
      args: ["install", "--ignore-scripts", ...config.packageSpecs],
    };
  }

  return {
    command: "corepack",
    args: [
      "pnpm",
      "add",
      "--ignore-workspace",
      "--ignore-scripts",
      "--config.confirm-modules-purge=false",
      "--config.package-import-method=copy",
      ...config.packageSpecs,
    ],
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

async function writeConsumerFiles(consumerDir, parsed) {
  await mkdir(path.join(consumerDir, "src"), { recursive: true });
  await writeFile(
    path.join(consumerDir, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(consumerDir, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        include: ["src/smoke.ts"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(consumerDir, "src", "smoke.ts"),
    [
      'import { createReservationPlatformClient } from "@reservation-platform/sdk";',
      'import type { ReservationResponse } from "@reservation-platform/contract-types";',
      "",
      "const client = createReservationPlatformClient({",
      '  baseUrl: "https://reservation-platform.example.test",',
      '  tenantId: "tenant_registry_proof",',
      '  getAccessToken: () => "registry-proof-token",',
      "});",
      "",
      "const reservation: ReservationResponse | null = null;",
      "void client;",
      "void reservation;",
      "",
    ].join("\n"),
    "utf8",
  );

  if (parsed.mode === "private") {
    await writeFile(
      path.join(consumerDir, ".npmrc"),
      [
        `registry=${parsed.values.RESERVATION_SDK_REGISTRY_PRIVATE_URL}`,
        "always-auth=true",
        privateRegistryAuthLine(
          parsed.values.RESERVATION_SDK_REGISTRY_PRIVATE_URL,
          parsed.values.RESERVATION_SDK_REGISTRY_PRIVATE_TOKEN,
        ),
        "",
      ].join("\n"),
      "utf8",
    );
  }
}

async function runInstallProof(parsed) {
  const consumerDir = await mkdtemp(path.join(os.tmpdir(), "reservation-sdk-registry-proof-"));
  try {
    await writeConsumerFiles(consumerDir, parsed);
    const installCommand = buildInstallCommand(parsed.config);
    console.log(
      `Installing configured SDK package specs into external temp consumer with ${parsed.packageManager}: ${parsed.packageSpecs.join(", ")}`,
    );
    await runProcess(installCommand.command, installCommand.args, {
      cwd: consumerDir,
      env: {
        ...process.env,
        npm_config_audit: "false",
        npm_config_fund: "false",
      },
      stdio: "inherit",
    });

    const tscPath = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");
    if (!existsSync(tscPath)) {
      throw new Error("Local TypeScript compiler was not found at node_modules/typescript/bin/tsc.");
    }
    await runProcess(process.execPath, [tscPath, "-p", "tsconfig.json"], {
      cwd: consumerDir,
      stdio: "inherit",
    });
    console.log("PASS SDK registry install proof imported SDK values and contract types in an external consumer.");
  } finally {
    if (parsed.config?.keepTemp) {
      console.log(`Kept SDK registry install proof temp consumer: ${consumerDir}`);
    } else {
      await rm(consumerDir, { recursive: true, force: true });
    }
  }
}

async function main() {
  const parsed = readSdkRegistryInstallConfig(process.env, { argv: process.argv.slice(2) });
  console.log("SDK registry install proof env contract checked.");

  if (parsed.shouldFail) {
    fail(parsed.message);
    return;
  }
  if (parsed.shouldSkip) {
    skip(`${parsed.message} No registry install was attempted and no packages were published.`);
    return;
  }

  await runInstallProof(parsed);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
