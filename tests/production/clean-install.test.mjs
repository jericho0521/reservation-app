import assert from "node:assert/strict";
import test from "node:test";

import {
  readCleanInstallProofConfig,
  verifyCleanInstall,
} from "../../scripts/production/verify-clean-install.mjs";

test("clean install proof stops after a failed readiness gate", async () => {
  const calls = [];
  const result = await verifyCleanInstall(fixture({ readiness: false, calls }));

  assert.equal(result.status, "failed");
  assert.equal(result.failedStep, "readiness");
  assert.deepEqual(calls, ["preflight", "install", "readiness"]);
});

test("clean install proof rejects missing DNS before installation", async () => {
  const calls = [];
  const result = await verifyCleanInstall(fixture({ dnsMatches: false, calls }));

  assert.equal(result.status, "failed");
  assert.equal(result.failedStep, "preflight");
  assert.deepEqual(calls, ["preflight"]);
});

test("clean install proof rejects public database exposure", async () => {
  const result = await verifyCleanInstall(fixture({ publicPorts: [22, 80, 443, 5432] }));

  assert.equal(result.status, "failed");
  assert.equal(result.failedStep, "ports");
});

test("clean install proof rejects automatic demo data", async () => {
  const result = await verifyCleanInstall(fixture({ demoAbsent: false }));

  assert.equal(result.status, "failed");
  assert.equal(result.failedStep, "demo-absence");
});

test("clean install proof rejects mutable release images without contacting the host", async () => {
  const calls = [];
  const manifest = releaseManifest();
  manifest.images.api.digest = "latest";
  const result = await verifyCleanInstall(fixture({ calls, releaseManifest: manifest }));

  assert.equal(result.status, "failed");
  assert.equal(result.failedStep, "release-manifest");
  assert.deepEqual(calls, []);
});

test("captured proof output redacts secrets and personal content", async () => {
  const result = await verifyCleanInstall(fixture({
    output: "Authorization: Bearer live-token password=hunter2 QR payload: private user@example.com",
  }));
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes("live-token"), false);
  assert.equal(serialized.includes("hunter2"), false);
  assert.equal(serialized.includes("private"), false);
  assert.equal(serialized.includes("user@example.com"), false);
  assert.match(serialized, /\[REDACTED\]/u);
});

test("strict clean-install config fails while local mode skips incomplete external configuration", () => {
  const local = readCleanInstallProofConfig({}, []);
  const strict = readCleanInstallProofConfig({}, ["--strict"]);

  assert.equal(local.status, "skipped");
  assert.equal(strict.status, "failed");
  assert.ok(strict.missing.includes("RESERVATION_PROOF_HOST"));
});

function fixture(overrides = {}) {
  const calls = overrides.calls ?? [];
  const output = overrides.output ?? "ok";
  const step = (name, details = {}) => async () => {
    calls.push(name);
    return { ok: true, output, ...details };
  };
  return {
    releaseManifest: overrides.releaseManifest ?? releaseManifest(),
    operations: {
      preflight: step("preflight", {
        ubuntuRelease: "24.04",
        targetEmpty: true,
        dnsMatches: overrides.dnsMatches ?? true,
        signaturesVerified: true,
      }),
      install: step("install", { demoSeeded: false }),
      readiness: async () => {
        calls.push("readiness");
        return { ok: overrides.readiness ?? true, output };
      },
      ports: step("ports", { publicPorts: overrides.publicPorts ?? [22, 80, 443] }),
      setupOwner: step("setup-owner"),
      setupReplay: step("setup-replay", { rejected: true }),
      demoAbsence: step("demo-absence", { absent: overrides.demoAbsent ?? true }),
      configureBusiness: step("configure-business", { published: true }),
      publicBooking: step("public-booking", { reservationCreated: true }),
    },
  };
}

function releaseManifest() {
  const digest = `sha256:${"a".repeat(64)}`;
  return {
    version: "0.2.0",
    requiredMigration: "000036",
    images: Object.fromEntries(
      ["api", "worker", "console", "booking", "tools"].map((name) => [
        name,
        { image: `ghcr.io/example/${name}:0.2.0`, digest },
      ]),
    ),
  };
}
