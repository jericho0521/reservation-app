#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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
export const sdkRegistryRequiredDisposableEnvNames = [sdkRegistryPackageSpecsEnvName];

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
  if (mode === "disposable") {
    return sdkRegistryRequiredDisposableEnvNames;
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
    disposableRegistryPort: values.RESERVATION_SDK_REGISTRY_DISPOSABLE_PORT
      ? Number.parseInt(values.RESERVATION_SDK_REGISTRY_DISPOSABLE_PORT, 10)
      : 0,
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
    RESERVATION_SDK_REGISTRY_DISPOSABLE_PORT: trimEnvValue(env, "RESERVATION_SDK_REGISTRY_DISPOSABLE_PORT"),
    RESERVATION_SDK_REGISTRY_KEEP_TEMP: trimEnvValue(env, "RESERVATION_SDK_REGISTRY_KEEP_TEMP"),
  };
  const errors = [];

  if (packageManagerError) {
    errors.push(packageManagerError);
  }

  if (mode && mode !== "private" && mode !== "public" && mode !== "disposable") {
    errors.push(`${sdkRegistryProofModeEnvName} must be private, public, or disposable when set.`);
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
  if (values.RESERVATION_SDK_REGISTRY_DISPOSABLE_PORT) {
    if (!/^(?:0|[1-9]\d*)$/.test(values.RESERVATION_SDK_REGISTRY_DISPOSABLE_PORT)) {
      errors.push("RESERVATION_SDK_REGISTRY_DISPOSABLE_PORT must be a non-negative integer when set.");
    } else {
      const port = Number.parseInt(values.RESERVATION_SDK_REGISTRY_DISPOSABLE_PORT, 10);
      if (!Number.isSafeInteger(port) || port > 65535) {
        errors.push("RESERVATION_SDK_REGISTRY_DISPOSABLE_PORT must be between 0 and 65535 when set.");
      }
    }
  }

  const requiredEnvNames = modeRequiredEnvNames(mode);
  const missing = mode ? requiredEnvNames.filter((name) => values[name].length === 0) : [sdkRegistryProofModeEnvName];
  const configured = [
    sdkRegistryProofModeEnvName,
    ...sdkRegistryRequiredPrivateEnvNames,
    "RESERVATION_SDK_REGISTRY_PACKAGE_MANAGER",
    "RESERVATION_SDK_REGISTRY_DISPOSABLE_PORT",
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

  if (mode === "private" || mode === "public" || mode === "disposable") {
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

function buildInstallCommand(config, packageSpecs = config.packageSpecs) {
  const registryArgs = config.registryUrl
    ? [`--registry=${config.registryUrl}`]
    : [];
  if (config.packageManager === "npm") {
    return {
      command: "npm",
      args: [
        "install",
        "--ignore-scripts",
        ...registryArgs,
        ...packageSpecs,
      ],
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
      ...registryArgs,
      ...packageSpecs,
    ],
  };
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const windowsNodeCli = process.platform === "win32" && (command === "corepack" || command === "npm");
    const executable = windowsNodeCli ? process.execPath : command;
    const executableArgs = windowsNodeCli
      ? [
          path.join(
            path.dirname(process.execPath),
            command === "corepack" ? "node_modules/corepack/dist/corepack.js" : "node_modules/npm/bin/npm-cli.js",
          ),
          ...args,
        ]
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

async function writeConsumerFiles(consumerDir, parsed) {
  await mkdir(path.join(consumerDir, "src"), { recursive: true });
  await mkdir(path.join(consumerDir, "types"), { recursive: true });
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
          skipLibCheck: true,
          typeRoots: ["./types"],
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
    const installEnv = {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_cache: path.join(consumerDir, ".npm-cache"),
      npm_config_store_dir: path.join(consumerDir, ".pnpm-store"),
      npm_config_state_dir: path.join(consumerDir, ".pnpm-state"),
    };
    const installSpecBatches = parsed.mode === "disposable"
      ? [...parsed.packageSpecs]
          .sort((left, right) => {
            const leftIsContract = left.startsWith("@reservation-platform/contract-types@");
            const rightIsContract = right.startsWith("@reservation-platform/contract-types@");
            return Number(rightIsContract) - Number(leftIsContract);
          })
          .map((spec) => [spec])
      : [parsed.packageSpecs];
    for (const packageSpecs of installSpecBatches) {
      const installCommand = buildInstallCommand(parsed.config, packageSpecs);
      console.log(
        `Installing configured SDK package specs into external temp consumer with ${parsed.packageManager}: ${packageSpecs.join(", ")}`,
      );
      await runProcess(installCommand.command, installCommand.args, {
        cwd: consumerDir,
        env: installEnv,
        stdio: "inherit",
      });
    }

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

function parsePackageSpec(spec) {
  const separator = spec.startsWith("@") ? spec.lastIndexOf("@") : spec.indexOf("@");
  return {
    name: spec.slice(0, separator),
    version: spec.slice(separator + 1),
  };
}

function packageTarballFileName(name, version) {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

async function findPackageTarball(name, version) {
  const fileName = packageTarballFileName(name, version);
  const candidates = [
    path.join(repoRoot, "packages", name.split("/").at(-1), "dist-packages", fileName),
    path.join(repoRoot, "dist-packages", fileName),
  ];

  for (const candidate of candidates) {
    try {
      const stats = await stat(candidate);
      if (stats.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(
    `Packed tarball for ${name}@${version} was not found. Run corepack pnpm run packages:pack before disposable registry proof.`,
  );
}

async function loadDisposableRegistryPackages(packageSpecs) {
  const packages = new Map();
  for (const spec of packageSpecs) {
    const { name, version } = parsePackageSpec(spec);
    if (!name.startsWith("@reservation-platform/")) {
      throw new Error(`Disposable registry proof only serves @reservation-platform packages, received ${name}.`);
    }

    const tarballPath = await findPackageTarball(name, version);
    const tarball = await readFile(tarballPath);
    packages.set(name, {
      name,
      version,
      tarball,
      tarballFileName: path.basename(tarballPath),
    });
  }
  return packages;
}

async function addLocalZodPackage(packages) {
  const zodPackageDir = path.join(repoRoot, "node_modules", "zod");
  const zodPackageJsonPath = path.join(zodPackageDir, "package.json");
  if (!existsSync(zodPackageJsonPath)) {
    throw new Error("Disposable registry proof requires local node_modules/zod. Run corepack pnpm install first.");
  }

  const zodPackageJson = JSON.parse(await readFile(zodPackageJsonPath, "utf8"));
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "reservation-sdk-registry-zod-"));
  await runProcess("npm", ["pack", zodPackageDir, "--pack-destination", tempDir, "--ignore-scripts"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_cache: path.join(tempDir, ".npm-cache"),
    },
    stdio: "ignore",
  });
  const tarballFileName = (await readdir(tempDir)).find((fileName) => fileName.endsWith(".tgz"));
  if (!tarballFileName) {
    await rm(tempDir, { recursive: true, force: true });
    throw new Error("Disposable registry proof could not pack local zod dependency.");
  }

  packages.set("zod", {
    name: "zod",
    version: zodPackageJson.version,
    tarball: await readFile(path.join(tempDir, tarballFileName)),
    tarballFileName,
    tempDir,
  });
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Connection": "close",
  });
  response.end(payload);
}

function sendTarball(response, tarball) {
  response.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": tarball.byteLength,
    "Connection": "close",
  });
  response.end(tarball);
}

async function startDisposableRegistry(config) {
  const packages = await loadDisposableRegistryPackages(config.packageSpecs);
  await addLocalZodPackage(packages);
  const server = createServer((request, response) => {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    const baseUrl = `http://${request.headers.host ?? "127.0.0.1"}`;
    const url = new URL(request.url ?? "/", baseUrl);
    const decodedPath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    console.log(`REGISTRY ${request.method} /${decodedPath}`);

    for (const packageInfo of packages.values()) {
      if (decodedPath === packageInfo.name) {
        const tarballUrl = `${baseUrl}/${encodeURIComponent(packageInfo.name)}/-/${packageInfo.tarballFileName}`;
        sendJson(response, 200, {
          name: packageInfo.name,
          "dist-tags": {
            latest: packageInfo.version,
          },
          versions: {
            [packageInfo.version]: {
              name: packageInfo.name,
              version: packageInfo.version,
              dist: {
                tarball: tarballUrl,
              },
            },
          },
        });
        return;
      }

      if (decodedPath === `${packageInfo.name}/-/${packageInfo.tarballFileName}`) {
        sendTarball(response, packageInfo.tarball);
        return;
      }
    }

    sendJson(response, 404, { error: "not_found" });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.disposableRegistryPort, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Disposable registry did not expose a TCP address.");
  }

  const registryUrl = `http://127.0.0.1:${address.port}/`;
  console.log(`Started disposable SDK registry at ${registryUrl}`);
  const firstPackage = packages.values().next().value;
  if (firstPackage) {
    const probeUrl = `${registryUrl}${encodeURIComponent(firstPackage.name)}`;
    const probeResponse = await fetch(probeUrl);
    if (!probeResponse.ok) {
      throw new Error(`Disposable registry self-probe failed for ${probeUrl}: ${probeResponse.status}.`);
    }
  }

  return {
    registryUrl,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      await Promise.all(
        [...packages.values()]
          .filter((packageInfo) => packageInfo.tempDir)
          .map((packageInfo) => rm(packageInfo.tempDir, { recursive: true, force: true })),
      );
    },
  };
}

async function runRegistryInstallProof(parsed) {
  if (parsed.mode !== "disposable") {
    await runInstallProof(parsed);
    return;
  }

  const registry = await startDisposableRegistry(parsed.config);
  try {
    await runInstallProof({
      ...parsed,
      config: {
        ...parsed.config,
        registryUrl: registry.registryUrl,
      },
    });
  } finally {
    await registry.close();
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

  await runRegistryInstallProof(parsed);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
