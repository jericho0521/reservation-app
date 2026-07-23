import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("browser CI runs protected journeys against the explicit demo fixture", () => {
  assert.match(workflow, /RESERVATION_BROWSER_USE_LOCAL_DEMO_FIXTURE:\s*"true"/u);
  assert.match(workflow, /run:\s*pnpm run stack:demo:up/u);
  assert.match(workflow, /run:\s*pnpm run stack:demo:verify/u);
  assert.match(workflow, /run:\s*pnpm run test:browser/u);
  assert.match(workflow, /run:\s*pnpm run stack:demo:down/u);
});

test("CI requires the clean product onboarding proof", () => {
  assert.match(workflow, /product-onboarding:/u);
  assert.match(workflow, /run:\s*pnpm run stack:verify:onboarding/u);
  assert.match(workflow, /path:\s*tmp\/product-onboarding-proof\//u);
});
