import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { requiredAcceptanceTasks, validateAcceptanceMarkdown } from "./validate-acceptance-evidence.mjs";

test("complete synthetic eight-hour acceptance evidence passes", () => {
  assert.deepEqual(validateAcceptanceMarkdown(markdown(validEvidence())), { ok: true, errors: [] });
});

test("pending templates, short runs, missing signatures, and incomplete tasks fail", () => {
  const value = validEvidence();
  value.evidence_status = "pending"; value.ended_at = "2026-07-15T15:00:00.000Z";
  value.operator.signature = "pending"; value.tasks_completed = ["install"];
  const result = validateAcceptanceMarkdown(markdown(value));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /evidence_status|eight hours|signature|tasks_completed/u);
});

test("a completed but rejected run does not open the release gate", () => {
  const evidence = validEvidence();
  evidence.verdict = "rejected";
  const result = validateAcceptanceMarkdown(markdown(evidence));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /verdict must equal "accepted"/u);
});

test("sensitive fields and contact-shaped values are rejected", () => {
  for (const mutation of [
    (value) => { value.operator.authorization = "Bearer abc.def"; },
    (value) => { value.operator.background = "contact operator@example.com"; },
    (value) => { value.incidents = [{ qr_payload: "private" }]; },
    (value) => { value.recovery_actions = [{ note: "+60 12-345 6789" }]; },
  ]) {
    const value = validEvidence(); mutation(value);
    assert.equal(validateAcceptanceMarkdown(markdown(value)).ok, false);
  }
});

test("invalid JSON and missing evidence blocks fail closed", () => {
  assert.equal(validateAcceptanceMarkdown("# no block").ok, false);
  assert.equal(validateAcceptanceMarkdown("```acceptance-evidence\n{bad}\n```").ok, false);
});

test("the checked-in 0.2.0 pending record cannot be mistaken for release evidence", () => {
  const pending = readFileSync(new URL("../../docs/release-evidence/0.2.0/full-day-acceptance.md", import.meta.url), "utf8");
  assert.equal(validateAcceptanceMarkdown(pending).ok, false);
});

function validEvidence() { return {
  schema_version: 1, evidence_status: "completed", release_version: "0.2.0", commit_sha: "a".repeat(40), migration_version: "000037",
  image_digests: Object.fromEntries(["api", "worker", "console", "booking", "tools"].map((name, index) => [name, `sha256:${String(index + 1).repeat(64)}`])),
  operator: { role: "business operator", background: "appointment operations", independent: true, signature: "Synthetic Test Operator", signed_at: "2026-07-15T18:01:00.000Z" },
  started_at: "2026-07-15T09:00:00.000Z", ended_at: "2026-07-15T18:00:00.000Z", tasks_completed: [...requiredAcceptanceTasks],
  incidents: [], recovery_actions: [], counts: { reservations: 12, messages: 20, jobs: 30 },
  backup: { id: "11111111-1111-4111-8111-111111111111", checksum: `sha256:${"f".repeat(64)}` }, verdict: "accepted",
}; }
function markdown(value) { return `# Acceptance\n\n\`\`\`acceptance-evidence\n${JSON.stringify(value)}\n\`\`\``; }
