import assert from "node:assert/strict";
import test from "node:test";
import { findRepositoryHygieneViolations } from "./verify-repository-hygiene.mjs";

test("repository hygiene accepts source and intentional UI assets", () => {
  assert.deepEqual(findRepositoryHygieneViolations([
    ".env.example",
    "apps/booking/public/brand-mark.png",
    "docs/manuals/backend-modules-dev-user-manual.html",
    "packages/sdk/src/index.ts",
  ]), []);
});

test("repository hygiene rejects local state, environment files, recordings, and obsolete manuals", () => {
  const findings = findRepositoryHygieneViolations([
    ".superpowers/.last-token",
    "tmp/acceptance/result.json",
    ".env.local",
    "docs/demo/recordings/fallback.mp4",
    "docs/manuals/old-manual.docx",
  ]);

  assert.equal(findings.length, 5);
  assert.match(findings.join("\n"), /agent state/u);
  assert.match(findings.join("\n"), /environment files/u);
  assert.match(findings.join("\n"), /under tmp/u);
  assert.match(findings.join("\n"), /checked HTML artifact/u);
});
