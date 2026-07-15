import assert from "node:assert/strict";
import test from "node:test";
import { validateReleaseDocContent, validateReleaseDocs } from "./verify-release-docs.mjs";

test("checked-in production documentation is complete and linked", () => {
  assert.deepEqual(validateReleaseDocs(), []);
});

test("documentation policy rejects embedded capabilities and fixed server credentials", () => {
  const errors = validateReleaseDocContent("unsafe.md", `# Unsafe

RESERVATION_SUPABASE_SERVICE_ROLE_KEY=real-secret-value

https://example.com/admin/setup?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA

QR payload: raw-device-pairing-secret
`);
  assert.equal(errors.length, 3);
});
