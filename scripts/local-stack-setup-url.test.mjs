import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readLocalSetupUrl } from "./local-stack-setup-url.mjs";

test("setup URL is returned only for protected product configuration", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "reservation-setup-url-"));
  await Promise.all([
    writeFile(path.join(directory, "stack-mode"), "product", { mode: 0o600 }),
    writeFile(path.join(directory, "setup-token"), "U".repeat(43), { mode: 0o600 }),
  ]);
  assert.equal(
    await readLocalSetupUrl(directory),
    `http://127.0.0.1:4300/admin/setup?token=${"U".repeat(43)}`,
  );
});

test("setup URL helper rejects demo configuration", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "reservation-demo-url-"));
  await Promise.all([
    writeFile(path.join(directory, "stack-mode"), "demo", { mode: 0o600 }),
    writeFile(path.join(directory, "setup-token"), "V".repeat(43), { mode: 0o600 }),
  ]);
  await assert.rejects(() => readLocalSetupUrl(directory), /only for the product stack/u);
});
