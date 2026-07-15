import assert from "node:assert/strict";
import test from "node:test";

import { SECURITY_BOUNDARY_PROOF, validateSecurityResult } from "../../scripts/production/run-release-drills.mjs";

test("security proof covers identities, route groups, HTTP controls, redaction, and private networking", () => {
  assert.deepEqual(SECURITY_BOUNDARY_PROOF.identities, ["anonymous", "owner", "staff", "service"]);
  for (const route of ["setup", "auth", "owner-settings", "staff-assignments", "public-booking", "management-links", "conversations", "system-status", "backups", "support-bundles"]) {
    assert.ok(SECURITY_BOUNDARY_PROOF.routeGroups.includes(route));
  }
  for (const control of ["csrf", "exact-cors", "cookie-flags", "rate-limits", "body-limits", "timeout", "secret-redaction", "qr-no-store", "private-database-network", "private-postgrest-network"]) {
    assert.ok(SECURITY_BOUNDARY_PROOF.controls.includes(control));
  }
});

test("security result rejects a missing check or public database port", () => {
  const passedCheckIds = SECURITY_BOUNDARY_PROOF.checks.map(({ id }) => id);
  assert.deepEqual(validateSecurityResult({ passedCheckIds, publicPorts: [22, 80, 443] }), []);
  assert.match(validateSecurityResult({ passedCheckIds: passedCheckIds.slice(1), publicPorts: [22, 80, 443, 5432] }).join(" "), /security check failed/u);
  assert.match(validateSecurityResult({ passedCheckIds, publicPorts: [22, 80, 443, 3000] }).join(" "), /unexpected public ports/u);
});
