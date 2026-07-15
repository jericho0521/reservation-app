import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("staff invitation link is an ephemeral server-action result", async () => {
  const [action, form] = await Promise.all([
    readFile(new URL("../app/settings/staff/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/auth/staff-invitation-form.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(action, /invitation_token/u);
  assert.match(action, /Copy this link now; it cannot be shown again/u);
  assert.doesNotMatch(action, /console\.|localStorage|sessionStorage/u);
  assert.match(form, /state\.invitationUrl/u);
  assert.match(form, /Transfer it privately/u);
});

test("invitation and reset tokens are removed from browser history and never logged", async () => {
  const sources = await Promise.all([
    readFile(new URL("../components/auth/invitation-acceptance-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/auth/password-reset-completion-form.tsx", import.meta.url), "utf8"),
  ]);

  for (const source of sources) {
    assert.match(source, /history\.replaceState/u);
    assert.doesNotMatch(source, /console\.|localStorage|sessionStorage/u);
    assert.match(source, /credentials: "include"/u);
  }
});

test("pending invitations cannot be activated from staff administration", async () => {
  const page = await readFile(new URL("../app/settings/staff/page.tsx", import.meta.url), "utf8");

  assert.match(page, /member\.status === "invited"/u);
  assert.match(page, /becomes active only when the recipient accepts/u);
});
