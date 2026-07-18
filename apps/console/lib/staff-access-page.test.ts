import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Staff Access renders an actionable fallback without swallowing the owner redirect", async () => {
  const page = await readFile(new URL("../app/settings/staff/page.tsx", import.meta.url), "utf8");

  assert.match(page, /SetupError/u);
  assert.match(page, /safeSetupErrorMessage/u);
  assert.match(page, /catch \(error\)/u);
  assert.ok(page.indexOf('if (session.role !== "owner") redirect("/")') < page.indexOf("client.listStaff()"));
});
