import assert from "node:assert/strict";
import test from "node:test";

import { renderReleaseEnvironment, validateUpgradePlan } from "./upgrade-plan.mjs";

test("accepts a forward upgrade with exact image digests and verified backup", () => {
  const result = validateUpgradePlan({
    currentVersion: "0.1.0",
    targetManifest: manifest(),
    backup: { status: "verified", archive: "reservation-0.1.0.tar.age" },
    availableDiskBytes: 2_000,
    requiredDiskBytes: 1_000,
    restoreDeclared: true,
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.direction, "upgrade");
});

test("rejects latest and a missing digest", () => {
  const target = manifest();
  target.images.api = { image: "ghcr.io/example/api:latest", digest: "" };

  const result = validateUpgradePlan(baseInput({ targetManifest: target }));

  assert.deepEqual(result.errors, [
    "api image must not use latest",
    "api image digest must be an exact sha256",
  ]);
});

test("rejects a downgrade without explicit compatibility", () => {
  const result = validateUpgradePlan(baseInput({
    currentVersion: "0.2.0",
    targetManifest: manifest({
      version: "0.1.0",
      minimumFromVersion: "0.1.0",
      images: imagesFor("0.1.0"),
    }),
  }));

  assert.deepEqual(result.errors, ["downgrade requires explicit compatibility approval"]);
});

test("accepts a downgrade only when manifest and operator both declare compatibility", () => {
  const result = validateUpgradePlan(baseInput({
    currentVersion: "0.2.0",
    targetManifest: manifest({
      version: "0.1.0",
      minimumFromVersion: "0.1.0",
      downgradeCompatible: true,
      images: imagesFor("0.1.0"),
    }),
    allowCompatibleDowngrade: true,
  }));

  assert.deepEqual(result.errors, []);
  assert.equal(result.direction, "downgrade");
});

test("rejects insufficient disk and an unverified backup", () => {
  const result = validateUpgradePlan(baseInput({
    availableDiskBytes: 999,
    requiredDiskBytes: 1_000,
    backup: { status: "started", archive: "pending.tar.age" },
  }));

  assert.deepEqual(result.errors, [
    "pre-upgrade backup is not verified",
    "insufficient disk space for upgrade",
  ]);
});

test("rejects an irreversible migration without a restore declaration", () => {
  const result = validateUpgradePlan(baseInput({
    targetManifest: manifest({ rollbackCompatible: false }),
    restoreDeclared: false,
  }));

  assert.deepEqual(result.errors, [
    "irreversible migration requires an explicit restore declaration",
  ]);
});

test("rejects missing rollback metadata and migrations newer than 000037", () => {
  const result = validateUpgradePlan(baseInput({
    targetManifest: manifest({ rollbackCompatible: undefined, requiredMigration: "000038" }),
  }));

  assert.deepEqual(result.errors, [
    "rollback compatibility declaration is required",
    "required migration 000038 is newer than supported migration 000037",
  ]);
});

test("renders digest-pinned release environment", () => {
  const output = renderReleaseEnvironment({
    domain: "book.example.com",
    manifest: manifest(),
  });

  assert.match(output, /^RESERVATION_DOMAIN=book\.example\.com$/mu);
  assert.match(output, /^RESERVATION_RELEASE=0\.2\.0$/mu);
  assert.match(output, /^RESERVATION_API_IMAGE=ghcr\.io\/example\/api:0\.2\.0@sha256:[a-f0-9]{64}$/mu);
  assert.equal(output.includes(":latest"), false);
});

function baseInput(overrides = {}) {
  return {
    currentVersion: "0.1.0",
    targetManifest: manifest(),
    backup: { status: "verified", archive: "reservation-0.1.0.tar.age" },
    availableDiskBytes: 2_000,
    requiredDiskBytes: 1_000,
    restoreDeclared: true,
    ...overrides,
  };
}

function manifest(overrides = {}) {
  return {
    version: "0.2.0",
    images: imagesFor("0.2.0"),
    requiredMigration: "000037",
    minimumFromVersion: "0.1.0",
    rollbackCompatible: true,
    ...overrides,
  };
}

function imagesFor(version) {
  const digest = `sha256:${"a".repeat(64)}`;
  return Object.fromEntries(
    ["api", "worker", "console", "booking", "tools"].map((component) => [
      component,
      { image: `ghcr.io/example/${component}:${version}`, digest },
    ]),
  );
}
