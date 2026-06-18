import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const checkOnly = process.argv.includes("--check");

const fixturePackageJsonPaths = [
  "examples/sdk-plain-typescript-smoke/package.json",
  "examples/sdk-server-to-server-smoke/package.json",
  "examples/sdk-vite-react-smoke/package.json",
  "examples/sdk-next-external-smoke/package.json",
  "examples/sdk-chat-disabled-smoke/package.json",
  "examples/sdk-chat-enabled-smoke/package.json",
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

for (const packageJsonPath of fixturePackageJsonPaths) {
  const absolutePath = path.join(repoRoot, packageJsonPath);
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
}

if (changedFiles.length > 0 && checkOnly) {
  throw new Error(
    `SDK fixture tarball specs are stale. Run corepack pnpm run sdk:fixtures:sync-tarballs. Stale files: ${changedFiles.join(", ")}`,
  );
}

console.log(
  changedFiles.length === 0
    ? "SDK fixture tarball specs are up to date."
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
