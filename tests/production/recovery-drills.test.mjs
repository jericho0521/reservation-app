import assert from "node:assert/strict";
import test from "node:test";

import { RECOVERY_PROOF, validateRecoveryResult } from "../../scripts/production/run-release-drills.mjs";

test("recovery proof fixes backup, restore, healthy upgrade, and failed-readiness order", () => {
  assert.deepEqual(RECOVERY_PROOF.steps, [
    "create-verified-backup",
    "restore-clean-installation",
    "compare-stable-identifiers-and-counts",
    "run-healthy-upgrade",
    "fail-target-readiness",
    "assert-target-not-public",
    "recover-previous-release",
  ]);
});

test("recovery result fails identifier drift without exposing record content", () => {
  const errors = validateRecoveryResult({
    backupVerified: true,
    stableIdentifiersMatch: false,
    recordCountsMatch: true,
    healthyUpgradePassed: true,
    failedTargetBlockedFromTraffic: true,
    previousReleaseRecovered: true,
  });
  assert.deepEqual(errors, ["stable identifiers changed after restore"]);
});
