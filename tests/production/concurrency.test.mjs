import assert from "node:assert/strict";
import test from "node:test";

import { CONCURRENCY_PROOF, validateConcurrencyResult } from "../../scripts/production/run-release-drills.mjs";

test("concurrency proof defines fifty unique correlations and controlled duplicate idempotency", () => {
  assert.equal(CONCURRENCY_PROOF.competingRequests, 50);
  assert.equal(new Set(CONCURRENCY_PROOF.correlationIds).size, 50);
  assert.equal(CONCURRENCY_PROOF.duplicateIdempotencyRequests, 2);
});

test("concurrency result requires one reservation, one notification, and no stuck claim", () => {
  assert.deepEqual(validateConcurrencyResult({
    competingRequests: 50,
    createdReservations: 1,
    duplicateResponsesIdentical: true,
    notificationCount: 1,
    stuckProposalClaims: 0,
  }), []);
  assert.match(validateConcurrencyResult({
    competingRequests: 50,
    createdReservations: 2,
    duplicateResponsesIdentical: true,
    notificationCount: 2,
    stuckProposalClaims: 1,
  }).join(" "), /exactly one reservation/u);
});
