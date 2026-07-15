import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { buildPublishedReleaseManifest, serializeReleaseManifest } from "./release-manifest.mjs";

const roots = [];
test.afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

test("signature verifier fails closed for an unsigned image and checks all mocked attestations", async () => {
  const fixture = await createFixture();
  const unsigned = run(fixture, { MOCK_COSIGN_FAIL: "1" });
  assert.notEqual(unsigned.status, 0);
  assert.match(unsigned.stderr, /image signature is invalid/u);

  await writeFile(fixture.log, "");
  const mockedSigned = run(fixture);
  assert.equal(mockedSigned.status, 0, mockedSigned.stderr);
  const calls = (await readFile(fixture.log, "utf8")).trim().split("\n");
  assert.equal(calls.filter((line) => line.startsWith("verify ")).length, 5);
  assert.equal(calls.filter((line) => line.startsWith("verify-attestation ")).length, 10);
  assert.equal(calls.every((line) => line.includes("@sha256:")), true);
});

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "reservation-signatures-"));
  roots.push(root);
  await mkdir(path.join(root, "scripts/production"), { recursive: true });
  await writeFile(path.join(root, "asset.txt"), "release asset\n");
  const manifest = await buildPublishedReleaseManifest({
    root, version: "0.2.0", commit: "a".repeat(40), assetPaths: ["asset.txt"],
    imageDigests: Object.fromEntries(["api", "worker", "console", "booking", "tools"].map((name) => [name, `sha256:${"b".repeat(64)}`])),
    minimumFromVersion: "0.1.0", rollbackCompatible: true,
  });
  const manifestPath = path.join(root, "release-manifest.json");
  await writeFile(manifestPath, serializeReleaseManifest(manifest));
  const cosign = path.join(root, "cosign");
  const log = path.join(root, "cosign.log");
  await writeFile(cosign, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$MOCK_COSIGN_LOG"\n[ "\${MOCK_COSIGN_FAIL:-0}" != 1 ]\n`);
  await chmod(cosign, 0o755);
  return { root, manifestPath, cosign, log };
}

function run(fixture, extraEnv = {}) {
  return spawnSync("sh", [new URL("./verify-signatures.sh", import.meta.url).pathname, fixture.manifestPath], {
    encoding: "utf8",
    env: { ...process.env, RELEASE_ROOT: fixture.root, COSIGN_BIN: fixture.cosign, MOCK_COSIGN_LOG: fixture.log, GITHUB_REPOSITORY: "jericho0521/reservation-app", ...extraEnv },
  });
}
