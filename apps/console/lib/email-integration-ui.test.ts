import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("owner email settings save through the SDK and keep credentials write-only", async () => {
  const [page, action, form, shell] = await Promise.all([
    readFile(new URL("../app/settings/email/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/settings/email/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/settings/email-settings-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/console-shell.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /session\.role !== "owner"/u);
  assert.match(page, /getEmailIntegrationSettings/u);
  assert.match(action, /updateEmailIntegrationSettings/u);
  assert.match(action, /testEmailIntegration\(\{ timeoutMs: 12_000 \}\)/u);
  assert.match(action, /Boolean\(username\) !== Boolean\(password\)/u);
  assert.match(form, /name="password" type="password" autoComplete="new-password"/u);
  assert.doesNotMatch(form, /name="password"[^>]*defaultValue/u);
  assert.doesNotMatch(`${page}\n${action}\n${form}`, /console\.|localStorage|sessionStorage/u);
  assert.match(shell, /\/admin\/settings\/email/u);
});

test("setup derives email readiness from saved integration settings", async () => {
  const [loader, channels] = await Promise.all([
    readFile(new URL("./onboarding-loader.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/setup/channels/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(loader, /getEmailIntegrationSettings/u);
  assert.match(loader, /emailReady: email\.enabled && email\.configured/u);
  assert.match(channels, /Configure email delivery/u);
});
