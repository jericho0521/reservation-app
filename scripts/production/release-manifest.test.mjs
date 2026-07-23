import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PUBLISHED_RELEASE_ASSETS,
  PRODUCTION_RELEASE_ASSETS,
  buildReleaseManifest,
  buildPublishedReleaseManifest,
  serializeReleaseManifest,
  validateReleaseManifest,
  verifyPublishedReleaseManifest,
  verifyReleaseManifest,
} from "./release-manifest.mjs";

const temporaryRoots = [];

test.afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("published release manifest requires one digest-pinned image per production component", () => {
  const result = validateReleaseManifest({
    schemaVersion: 1,
    version: "0.2.0",
    commit: "a".repeat(40),
    requiredMigration: "000043",
    minimumFromVersion: "0.1.0",
    rollbackCompatible: true,
    downgradeCompatible: false,
    images: { api: { image: "ghcr.io/jericho0521/reservation-app-api:0.2.0", digest: `sha256:${"a".repeat(64)}` } },
    assets: [],
  });
  assert.deepEqual(result.errors.sort(), ["missing image: booking", "missing image: console", "missing image: tools", "missing image: worker"]);
});

test("published release validation rejects mutable metadata, malformed digests, migration drift, duplicates, and missing rollback declarations", () => {
  const manifest = publishedManifest();
  manifest.version = "v0.2";
  manifest.requiredMigration = "000035";
  manifest.rollbackCompatible = undefined;
  manifest.images.api = { image: "ghcr.io/jericho0521/reservation-app-api:latest", digest: "sha256:bad" };
  manifest.images.worker = { ...manifest.images.api };
  const result = validateReleaseManifest(manifest);
  assert.equal(result.errors.includes("version must be an exact semantic version"), true);
  assert.equal(result.errors.includes("required migration must match 000043"), true);
  assert.equal(result.errors.includes("rollback compatibility declaration is required"), true);
  assert.equal(result.errors.includes("invalid image digest: api"), true);
  assert.equal(result.errors.some((error) => error.startsWith("duplicate image reference:")), true);
});

test("published manifest binds observed digests, compatibility, commit, and release assets", async () => {
  const root = await fixture();
  const assetPaths = ["asset.txt", "nested/asset.txt"];
  const manifest = await buildPublishedReleaseManifest({
    root, version: "0.2.0", commit: "b".repeat(40), imageDigests: digests(), assetPaths,
    requiredMigration: "000043", minimumFromVersion: "0.1.0", rollbackCompatible: false,
  });
  assert.equal(manifest.images.tools.image, "ghcr.io/jericho0521/reservation-app-tools:0.2.0");
  assert.equal(manifest.images.tools.digest, `sha256:${"e".repeat(64)}`);
  await verifyPublishedReleaseManifest({ root, manifest });
  await writeFile(path.join(root, "asset.txt"), "changed\n");
  await assert.rejects(verifyPublishedReleaseManifest({ root, manifest }), /asset checksum does not match/u);
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "reservation-release-manifest-"));
  temporaryRoots.push(root);
  await mkdir(path.join(root, "nested"));
  await writeFile(path.join(root, "asset.txt"), "one\n");
  await writeFile(path.join(root, "nested/asset.txt"), "two\n");
  return root;
}

test("release manifest is deterministic and binds assets plus five exact images", async () => {
  const root = await fixture();
  const assetPaths = ["asset.txt", "nested/asset.txt"];
  const manifest = await buildReleaseManifest({ root, release: "1.2.3", assetPaths });

  assert.deepEqual(Object.keys(manifest.images), ["api", "worker", "console", "booking", "tools"]);
  assert.equal(manifest.images.tools, "ghcr.io/jericho0521/reservation-app-tools:1.2.3");
  assert.deepEqual(manifest.assets.map(({ path: assetPath }) => assetPath), assetPaths);
  assert.equal(serializeReleaseManifest(manifest), serializeReleaseManifest(manifest));
  await verifyReleaseManifest({ root, release: "1.2.3", manifest, assetPaths });
});

function digests() {
  return Object.fromEntries(["api", "worker", "console", "booking", "tools"].map((component, index) => [component, `sha256:${String.fromCharCode(97 + index).repeat(64)}`]));
}

function publishedManifest() {
  const version = "0.2.0";
  const imageNames = { api: "reservation-app-api", worker: "reservation-app-worker", console: "reservation-app-console", booking: "reservation-app-booking", tools: "reservation-app-tools" };
  return {
    schemaVersion: 1, version, commit: "a".repeat(40), requiredMigration: "000043", minimumFromVersion: "0.1.0",
    rollbackCompatible: true, downgradeCompatible: false,
    images: Object.fromEntries(Object.entries(imageNames).map(([component, name], index) => [component, { image: `ghcr.io/jericho0521/${name}:${version}`, digest: Object.values(digests())[index] }])),
    assets: [],
  };
}

test("production manifest covers every installer-consumed bundle asset", () => {
  assert.deepEqual(PRODUCTION_RELEASE_ASSETS, [
    "package.json",
    "compose.production.yml",
    "docker/production/Caddyfile",
    "docker/production/postgrest.conf",
    "docker/production/allowlists/api.env",
    "docker/production/allowlists/migrate.env",
    "docker/production/allowlists/worker.env",
    "scripts/production/install.sh",
    "scripts/production/preflight.sh",
    "scripts/production/release-manifest.mjs",
    "scripts/production/smoke.mjs",
    "scripts/production/support-bundle.sh",
    "scripts/production/support-bundle-sanitize.mjs",
  ]);
});

test("published bundle ships the complete public frontend toolkit", () => {
  for (const packageName of ["contract-types", "sdk", "react", "ui"]) {
    assert.ok(PUBLISHED_RELEASE_ASSETS.includes(`packages/reservation-platform-${packageName}-0.2.0.tgz`));
  }
});

test("release verification rejects release drift, asset drift, and unexpected fields", async () => {
  const root = await fixture();
  const assetPaths = ["asset.txt", "nested/asset.txt"];
  const manifest = await buildReleaseManifest({ root, release: "1.2.3", assetPaths });

  await assert.rejects(
    verifyReleaseManifest({ root, release: "1.2.4", manifest, assetPaths }),
    /release does not match/u,
  );
  await writeFile(path.join(root, "asset.txt"), "changed\n");
  await assert.rejects(
    verifyReleaseManifest({ root, release: "1.2.3", manifest, assetPaths }),
    /asset checksum does not match: asset\.txt/u,
  );
  await assert.rejects(
    verifyReleaseManifest({
      root,
      release: "1.2.3",
      manifest: { ...manifest, unexpected: true },
      assetPaths,
    }),
    /unexpected manifest fields/u,
  );
  await assert.rejects(
    verifyReleaseManifest({
      root,
      release: "1.2.3",
      manifest: {
        ...manifest,
        images: { ...manifest.images, api: "ghcr.io/jericho0521/reservation-app-api:latest" },
      },
      assetPaths,
    }),
    /image reference does not match: api/u,
  );
});
