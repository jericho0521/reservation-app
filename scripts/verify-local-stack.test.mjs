import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { localStackComposeErrors, secretLiteralFindings } from "./verify-local-stack.mjs";

test("Compose model defines the complete private local stack", () => {
  const model = JSON.parse(execFileSync(
    "docker",
    ["compose", "--profile", "operations", "config", "--format", "json"],
    { encoding: "utf8" },
  ));
  assert.deepEqual(localStackComposeErrors(model), []);
});

test("tracked stack sources contain no usable generated credential literals", async () => {
  const sources = await Promise.all([
    "../docker-compose.yml",
    "../Dockerfile.local-stack",
    "../Dockerfile.web",
    "./local-stack-config.mjs",
  ].map(async (relativePath) => ({
    path: relativePath,
    text: await readFile(new URL(relativePath, import.meta.url), "utf8"),
  })));
  assert.deepEqual(secretLiteralFindings(sources), []);
});

test("local migration image assigns the migration bundle to its non-root runner", async () => {
  const dockerfile = await readFile(new URL("../Dockerfile.local-stack", import.meta.url), "utf8");
  assert.match(dockerfile, /COPY --chown=1001:1001 packages\/database\/migrations\/supabase/u);
});
