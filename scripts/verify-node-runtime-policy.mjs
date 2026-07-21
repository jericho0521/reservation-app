import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const requiredNodeEngine = ">=24 <25";

async function packageManifestPaths(repositoryRoot) {
  const paths = ["package.json"];
  const visit = async (relativeDirectory) => {
    for (const entry of await readdir(path.join(repositoryRoot, relativeDirectory), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const child = path.join(relativeDirectory, entry.name);
      try {
        await readFile(path.join(repositoryRoot, child, "package.json"), "utf8");
        paths.push(path.join(child, "package.json"));
      } catch {
        await visit(child);
      }
    }
  };
  for (const root of ["apps", "packages"]) await visit(root);
  return paths;
}

export function verifyNodeRuntimePolicy(manifests) {
  return manifests.flatMap(({ path: manifestPath, manifest }) =>
    manifest.engines?.node === requiredNodeEngine
      ? []
      : [`${manifestPath} must declare engines.node as ${requiredNodeEngine}`],
  );
}

async function runCli() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const manifests = await Promise.all((await packageManifestPaths(repositoryRoot)).map(async (manifestPath) => ({
    path: manifestPath,
    manifest: JSON.parse(await readFile(path.join(repositoryRoot, manifestPath), "utf8")),
  })));
  const findings = verifyNodeRuntimePolicy(manifests);
  if (findings.length > 0) {
    for (const finding of findings) console.error(finding);
    process.exitCode = 1;
    return;
  }
  console.log(`Node runtime policy verified for ${manifests.length} manifests.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await runCli();
