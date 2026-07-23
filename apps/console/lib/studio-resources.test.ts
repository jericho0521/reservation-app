import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("configured quantity-service resources remain editable", async () => {
  const page = await readFile(new URL("../app/studio/resources/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const pooledCapacityEmpty = capacityOnly && resources\.length === 0/u);
  assert.match(page, /resources\.map\(\(resource\) => <ResourceEditor/u);
  assert.match(page, /resource=\{resource\}/u);
});
