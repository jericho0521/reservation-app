import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const repoRoot = process.cwd();
const checkOnly = process.argv.includes("--check");

const fixtureManifests = [
  {
    packageJsonPath: "examples/sdk-plain-typescript-smoke/package.json",
    lockfilePath: "examples/sdk-plain-typescript-smoke/pnpm-lock.yaml",
  },
  {
    packageJsonPath: "examples/sdk-server-to-server-smoke/package.json",
    lockfilePath: "examples/sdk-server-to-server-smoke/pnpm-lock.yaml",
  },
  {
    packageJsonPath: "examples/sdk-vite-react-smoke/package.json",
    lockfilePath: "examples/sdk-vite-react-smoke/pnpm-lock.yaml",
  },
  {
    packageJsonPath: "examples/sdk-next-external-smoke/package.json",
    lockfilePath: "examples/sdk-next-external-smoke/pnpm-lock.yaml",
  },
  {
    packageJsonPath: "examples/sdk-chat-disabled-smoke/package.json",
    lockfilePath: "examples/sdk-chat-disabled-smoke/pnpm-lock.yaml",
  },
  {
    packageJsonPath: "examples/sdk-chat-enabled-smoke/package.json",
    lockfilePath: "examples/sdk-chat-enabled-smoke/pnpm-lock.yaml",
  },
];

const packageVersions = {
  "@reservation-platform/contract-types": await readVersion("packages/contract-types/package.json"),
  "@reservation-platform/sdk": await readVersion("packages/sdk/package.json"),
};

const tarballSpecs = {
  "@reservation-platform/contract-types": `file:../../dist-packages/reservation-platform-contract-types-${packageVersions["@reservation-platform/contract-types"]}.tgz`,
  "@reservation-platform/sdk": `file:../../dist-packages/reservation-platform-sdk-${packageVersions["@reservation-platform/sdk"]}.tgz`,
};
const changedFiles = [];
const staleLockfiles = [];

for (const { packageJsonPath, lockfilePath } of fixtureManifests) {
  const absolutePath = path.join(repoRoot, packageJsonPath);
  const packageDir = path.dirname(absolutePath);
  const original = await readFile(absolutePath, "utf8");
  const fixturePackageJson = JSON.parse(original);

  fixturePackageJson.dependencies ??= {};
  fixturePackageJson.pnpm ??= {};
  fixturePackageJson.pnpm.overrides ??= {};

  for (const [packageName, tarballSpec] of Object.entries(tarballSpecs)) {
    fixturePackageJson.dependencies[packageName] = tarballSpec;
  }

  fixturePackageJson.pnpm.overrides["@reservation-platform/contract-types"] =
    tarballSpecs["@reservation-platform/contract-types"];

  const updated = `${JSON.stringify(fixturePackageJson, null, 2)}\n`;
  if (updated !== original) {
    changedFiles.push(packageJsonPath);
    if (!checkOnly) {
      await writeFile(absolutePath, updated);
    }
  }

  if (checkOnly) {
    const lockfileText = await readFile(path.join(repoRoot, lockfilePath), "utf8");
    const tarballIntegrities = Object.fromEntries(
      await Promise.all(
        Object.entries(tarballSpecs).map(async ([packageName, tarballSpec]) => [
          packageName,
          await readTarballIntegrity(packageDir, tarballSpec),
        ]),
      ),
    );
    const missingTarballs = Object.values(tarballSpecs).filter(
      (tarballSpec) => !lockfileText.includes(tarballSpec.replace(/^file:/, "")),
    );
    const missingIntegrities = Object.values(tarballIntegrities).filter(
      (integrity) => !lockfileText.includes(integrity),
    );
    const contractVersionPattern = escapeRegExp(packageVersions["@reservation-platform/contract-types"]);
    const sdkVersionPattern = escapeRegExp(packageVersions["@reservation-platform/sdk"]);
    const forbiddenLockfileSpecs = [
      /\bworkspace:/,
      /\blink:/,
      /file:\.\.\/\.\.\/packages\//,
      new RegExp(`reservation-platform-contract-types-(?!${contractVersionPattern}\\.tgz\\b)[0-9][^/\\s]*\\.tgz`),
      new RegExp(`reservation-platform-sdk-(?!${sdkVersionPattern}\\.tgz\\b)[0-9][^/\\s]*\\.tgz`),
    ];

    if (
      missingTarballs.length > 0 ||
      missingIntegrities.length > 0 ||
      forbiddenLockfileSpecs.some((pattern) => pattern.test(lockfileText))
    ) {
      staleLockfiles.push(lockfilePath);
    }
  }
}

if (changedFiles.length > 0 && checkOnly) {
  throw new Error(
    `SDK fixture tarball specs are stale. Run corepack pnpm run sdk:fixtures:sync-tarballs. Stale files: ${changedFiles.join(", ")}`,
  );
}

if (staleLockfiles.length > 0) {
  throw new Error(
    `SDK fixture lockfiles are stale or use non-tarball specs. Reinstall fixture dependencies after packing tarballs. Stale files: ${staleLockfiles.join(", ")}`,
  );
}

console.log(
  changedFiles.length === 0
    ? "SDK fixture tarball specs and lockfiles are up to date."
    : `Updated SDK fixture tarball specs in ${changedFiles.length} package manifests.`,
);

async function readVersion(packageJsonPath) {
  const packageJson = JSON.parse(
    await readFile(path.join(repoRoot, packageJsonPath), "utf8"),
  );
  if (!packageJson.version) {
    throw new Error(`${packageJsonPath} is missing a version`);
  }
  return packageJson.version;
}

async function readTarballIntegrity(packageDir, tarballSpec) {
  const tarballPath = tarballSpec.replace(/^file:/, "");
  const tarballBytes = await readFile(path.resolve(packageDir, tarballPath));
  return `sha512-${createHash("sha512").update(tarballBytes).digest("base64")}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
