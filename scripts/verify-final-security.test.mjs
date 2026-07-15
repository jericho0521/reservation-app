import assert from "node:assert/strict";
import test from "node:test";
import { productionSecurityFindingsForText, securityFindingsForText } from "./verify-final-security.mjs";

test("security scan rejects secrets in client modules and QR logging", () => {
  assert.equal(securityFindingsForText("client.tsx", '"use client"; const key = "RESERVATION_SUPABASE_SERVICE_ROLE_KEY";').length, 1);
  assert.equal(securityFindingsForText("adapter.ts", 'console.log("QR payload", qr);').length, 1);
});

test("security scan permits server-only environment-name validation without values", () => {
  assert.deepEqual(securityFindingsForText("server.ts", 'const required = "RESERVATION_PLATFORM_SERVICE_API_KEY";'), []);
});

test("production scan rejects wildcard CORS, public database ports, and mutable images", () => {
  assert.equal(productionSecurityFindingsForText("compose.yml", "RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS: '*'\n").length, 1);
  assert.equal(productionSecurityFindingsForText("compose.yml", "reservation-db:\n  image: postgres@sha256:abc\n  ports:\n    - 5432:5432\n").some((finding) => finding.includes("database")), true);
  assert.equal(productionSecurityFindingsForText("compose.yml", "image: postgres:latest\n").some((finding) => finding.includes("unpinned")), true);
});

test("repository security verification does not scan its own detection fixtures", async () => {
  const { verifyFinalSecurity } = await import("./verify-final-security.mjs");
  assert.doesNotThrow(() => verifyFinalSecurity());
});
