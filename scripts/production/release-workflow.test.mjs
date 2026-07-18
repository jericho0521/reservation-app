import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("release workflow builds, attests, signs, and packages all immutable components", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8");
  for (const component of ["api", "worker", "console", "booking", "tools"]) assert.match(workflow, new RegExp(`component: ${component}\\b`, "u"));
  for (const required of ["platforms: linux/amd64", "provenance: mode=max", "sbom: true", "cosign sign --yes", "--generate-published", "softprops/action-gh-release", "name: production-release"]) assert.equal(workflow.includes(required), true, required);
  for (const packageName of ["reservation-platform-sdk", "reservation-platform-contract-types"]) assert.match(workflow, new RegExp(`${packageName}-`, "u"));
  assert.doesNotMatch(workflow, /image:\s*[^\n]*:latest|tags:\s*[^\n]*:latest/u);
  assert.match(workflow, /git cat-file -t/u);
  assert.match(workflow, /package\.json[\s\S]*= "\$version"/u);
});

test("deployment validates a chosen published bundle and contains no provider placeholder", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
  for (const required of ["release_version:", "gh release download", "sha256sum -c", "verify-signatures.sh", "release-validation.json", "environment:"]) assert.equal(workflow.includes(required), true, required);
  assert.doesNotMatch(workflow, /deployment placeholder|add your .*deploy|:latest/iu);
});

test("release installer verifies evidence before delegating without accepting a release tag", async () => {
  const installer = await readFile(new URL("../../release/install.sh", import.meta.url), "utf8");
  assert.ok(installer.indexOf("verify-signatures.sh") < installer.indexOf("scripts/production/install.sh"));
  assert.match(installer, /--release "\$release"/u);
  assert.doesNotMatch(installer, /--release\)\s*release=/u);
  assert.doesNotMatch(installer, /:latest/u);
});
