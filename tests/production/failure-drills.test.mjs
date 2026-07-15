import assert from "node:assert/strict";
import test from "node:test";

import {
  FAILURE_DRILLS,
  readReleaseDrillConfig,
  runReleaseDrills,
} from "../../scripts/production/run-release-drills.mjs";

test("failure matrix contains every required setup, mutation, recovery, and integrity drill", () => {
  assert.deepEqual(FAILURE_DRILLS.map(({ id }) => id), [
    "restart-api-with-active-session",
    "restart-worker-with-leased-job",
    "disable-ai-provider",
    "disconnect-whatsapp",
    "reject-smtp-delivery",
    "stop-database",
    "simulate-low-disk",
    "submit-stale-slot",
    "submit-duplicate-idempotency-key",
    "fail-target-upgrade-readiness",
  ]);
  for (const drill of FAILURE_DRILLS) {
    assert.ok(drill.setup.length > 0);
    assert.ok(drill.mutation.length > 0);
    assert.ok(drill.expected.length > 0);
    assert.ok(drill.recovery.length > 0);
    assert.ok(drill.integrity.length > 0);
  }
});

test("release drill runner stops after a failed recovery", async () => {
  const calls = [];
  const result = await runReleaseDrills({ driver: driver({ calls, failFailureAt: 2 }) });

  assert.equal(result.status, "failed");
  assert.equal(result.failedGate, FAILURE_DRILLS[2].id);
  assert.deepEqual(calls, FAILURE_DRILLS.slice(0, 3).map(({ id }) => id));
});

test("release drill runner completes the full failure, concurrency, security, and recovery proof", async () => {
  const result = await runReleaseDrills({ driver: driver() });

  assert.equal(result.status, "passed");
  assert.deepEqual(result.completedGates, [
    ...FAILURE_DRILLS.map(({ id }) => id),
    "concurrency",
    "security-boundaries",
    "recovery",
  ]);
});

test("strict drill configuration fails while local mode skips missing live driver settings", () => {
  assert.equal(readReleaseDrillConfig({}, []).status, "skipped");
  assert.equal(readReleaseDrillConfig({}, ["--strict"]).status, "failed");
});

export function driver(options = {}) {
  return {
    runFailureDrill: async (drill) => {
      options.calls?.push(drill.id);
      return {
        degradedAsExpected: true,
        recovered: drill.id !== FAILURE_DRILLS[options.failFailureAt]?.id,
        integrityPreserved: true,
      };
    },
    runConcurrency: async () => ({
      competingRequests: 50,
      createdReservations: 1,
      duplicateResponsesIdentical: true,
      notificationCount: 1,
      stuckProposalClaims: 0,
    }),
    runSecurityBoundaries: async (definition) => ({
      passedCheckIds: definition.checks.map(({ id }) => id),
      publicPorts: [22, 80, 443],
    }),
    runRecovery: async () => ({
      backupVerified: true,
      stableIdentifiersMatch: true,
      recordCountsMatch: true,
      healthyUpgradePassed: true,
      failedTargetBlockedFromTraffic: true,
      previousReleaseRecovered: true,
    }),
  };
}
