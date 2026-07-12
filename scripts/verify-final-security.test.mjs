import assert from "node:assert/strict";
import test from "node:test";
import { securityFindingsForText } from "./verify-final-security.mjs";

test("security scan rejects secrets in client modules and QR logging", () => {
  assert.equal(securityFindingsForText("client.tsx", '"use client"; const key = "RESERVATION_SUPABASE_SERVICE_ROLE_KEY";').length, 1);
  assert.equal(securityFindingsForText("adapter.ts", 'console.log("QR payload", qr);').length, 1);
});

test("security scan permits server-only environment-name validation without values", () => {
  assert.deepEqual(securityFindingsForText("server.ts", 'const required = "RESERVATION_PLATFORM_SERVICE_API_KEY";'), []);
});
