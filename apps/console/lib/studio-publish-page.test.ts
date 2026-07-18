import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Studio keeps a useful success state after the published draft is consumed", async () => {
  const page = await readFile(new URL("../app/studio/publish/page.tsx", import.meta.url), "utf8");

  assert.match(page, /workspace\.published/u);
  assert.match(page, /Experience published/u);
  assert.match(page, /View public experience/u);
  assert.match(page, /Create next revision/u);
});
