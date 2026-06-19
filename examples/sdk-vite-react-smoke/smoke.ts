import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBrowserSdkSmoke } from "./src/sdkSmokeFlow";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const smokeTimeoutMs = 5_000;
const buildTimeoutMs = 30_000;

const result = await withTimeout(
  runBrowserSdkSmoke(),
  smokeTimeoutMs,
  "Vite/React SDK smoke flow timed out",
);
assert.equal(result.metadataVersion, "v1");
assert.equal(result.availableQuantity, 4);
assert.equal(result.reservationId, "res_vite_react_1");
assert.equal(result.observedRequestCount, 7);

const build = process.platform === "win32"
  ? spawnSync("corepack pnpm run build", { cwd: fixtureRoot, stdio: "inherit", shell: true, timeout: buildTimeoutMs })
  : spawnSync("corepack", ["pnpm", "run", "build"], { cwd: fixtureRoot, stdio: "inherit", timeout: buildTimeoutMs });
assert.ifError(build.error);
assert.equal(build.status, 0, "vite build failed or timed out");

await assertManifestDependencies();
await assertImportSpecifiers([
  path.join(fixtureRoot, "smoke.ts"),
  path.join(fixtureRoot, "vite.config.ts"),
]);
await scanTextFiles(path.join(fixtureRoot, "src"), sourceForbiddenPatterns(), "source");
await scanTextFiles(path.join(fixtureRoot, "dist"), bundleForbiddenPatterns(), "bundle");

console.log("Reservation platform SDK Vite/React browser smoke passed");

async function assertManifestDependencies() {
  const sdkTarball = "file:../../dist-packages/reservation-platform-sdk-0.0.0.tgz";
  const contractTarball = "file:../../dist-packages/reservation-platform-contract-types-0.0.0.tgz";
  const manifest = JSON.parse(await readFile(path.join(fixtureRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    pnpm?: { overrides?: Record<string, string> };
  };
  const sections = [
    manifest.dependencies ?? {},
    manifest.devDependencies ?? {},
    manifest.optionalDependencies ?? {},
    manifest.peerDependencies ?? {},
    manifest.pnpm?.overrides ?? {},
  ];
  const allowed = new Set([
    "@reservation-platform/contract-types",
    "@reservation-platform/sdk",
    "@types/node",
    "@types/react",
    "@types/react-dom",
    "@vitejs/plugin-react",
    "react",
    "react-dom",
    "tsx",
    "typescript",
    "vite",
  ]);

  assert.equal(manifest.dependencies?.["@reservation-platform/sdk"], sdkTarball);
  assert.equal(manifest.dependencies?.["@reservation-platform/contract-types"], contractTarball);
  assert.equal(manifest.pnpm?.overrides?.["@reservation-platform/contract-types"], contractTarball);

  for (const dependencies of sections) {
    for (const [name, specifier] of Object.entries(dependencies)) {
      assert.equal(allowed.has(name), true, `unexpected Vite/React fixture dependency: ${name}`);
      assert.equal(specifier.includes("workspace:"), false, `${name} must not use a workspace link`);
      assert.equal(specifier.startsWith("link:"), false, `${name} must not use a local link`);
      assert.equal(specifier.startsWith("file:../../packages/"), false, `${name} must not install from workspace source`);
    }
  }
}

function sourceForbiddenPatterns() {
  return [
    /@reservation-platform\/(?!sdk\b|contract-types\b)[a-z0-9-]+/i,
    /packages\/(?:reservation-platform-api|ai-chat|database)/i,
    /@ai-sdk\//i,
    /@google\/generative-ai/i,
    /\b(?:openai|anthropic)\b/i,
    /@supabase/i,
    /supabase/i,
    /@langchain/i,
    /langchain/i,
    /@project-play/i,
    /from\s+["']next(?:\/|["'])/i,
    /from\s+["']node:/i,
    /process\.env/i,
    /\bBuffer\b/,
    /\brequire\s*\(/,
    /service[_-]?role/i,
    /server[_-]?only/i,
    /GOOGLE_GENERATIVE_AI_API_KEY/i,
    /OPENROUTER_API_KEY/i,
    /app\/api/i,
    /components\//i,
    /lib\//i,
  ];
}

function bundleForbiddenPatterns() {
  return [
    /@reservation-platform\/(?!sdk\b|contract-types\b)[a-z0-9-]+/i,
    /packages\/(?:reservation-platform-api|ai-chat|database)/i,
    /@ai-sdk\//i,
    /@google\/generative-ai/i,
    /\b(?:openai|anthropic)\b/i,
    /@supabase/i,
    /supabase/i,
    /@langchain/i,
    /langchain/i,
    /@project-play/i,
    /next\/(?:headers|navigation|server|cache|cookies)/i,
    /process\.env/i,
    /\bBuffer\b/,
    /\brequire\s*\(/,
    /service[_-]?role/i,
    /server[_-]?only/i,
    /GOOGLE_GENERATIVE_AI_API_KEY/i,
    /OPENROUTER_API_KEY/i,
    /app\/api/i,
    /components\//i,
    /lib\//i,
  ];
}

async function assertImportSpecifiers(filePaths: string[]) {
  for (const filePath of filePaths) {
    const text = await readFile(filePath, "utf8");
    for (const specifier of extractImportSpecifiers(text)) {
      assert.equal(
        isAllowedHarnessImport(specifier),
        true,
        `forbidden harness import ${specifier} in ${path.relative(fixtureRoot, filePath)}`,
      );
    }
  }
}

function extractImportSpecifiers(text: string) {
  return [
    ...Array.from(text.matchAll(/\bfrom\s+["']([^"']+)["']/g), (match) => match[1]),
    ...Array.from(text.matchAll(/\bimport\s+["']([^"']+)["']/g), (match) => match[1]),
    ...Array.from(text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g), (match) => match[1]),
    ...Array.from(text.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g), (match) => match[1]),
  ];
}

function isAllowedHarnessImport(specifier: string) {
  if (specifier.startsWith("node:")) {
    return true;
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return !/(?:^|[/\\])(?:app|components|lib|types|data|packages)(?:[/\\]|$)/.test(specifier);
  }
  if (specifier === "vite" || specifier === "@vitejs/plugin-react") {
    return true;
  }
  return false;
}

async function scanTextFiles(root: string, forbiddenPatterns: RegExp[], label: string) {
  for (const filePath of await listFiles(root)) {
    if (!isTextFile(filePath)) {
      continue;
    }
    const text = await readFile(filePath, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.equal(
        pattern.test(text),
        false,
        `${label} scan found forbidden pattern ${pattern} in ${path.relative(fixtureRoot, filePath)}`,
      );
    }
  }
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return listFiles(fullPath);
    }
    if (entry.isFile() && (await stat(fullPath)).size <= 2_000_000) {
      return [fullPath];
    }
    return [];
  }));
  return files.flat();
}

function isTextFile(filePath: string) {
  return [".css", ".html", ".js", ".json", ".map", ".svg", ".ts", ".tsx", ".txt"].includes(path.extname(filePath));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
