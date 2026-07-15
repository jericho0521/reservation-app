import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI settings remain owner-managed and keep provider keys write-only", async () => {
  const [page, actions, form] = await Promise.all([
    readFile(new URL("../app/settings/ai/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/settings/ai/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/settings/ai-settings-form.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /session\.role !== "owner"/u);
  assert.match(actions, /updateAiIntegrationSettings/u);
  assert.match(actions, /revokeAiIntegrationCredential/u);
  assert.match(form, /type="password"/u);
  assert.doesNotMatch(form, /value=\{value\.api_key/u);
});
