import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PRODUCTION_RELEASE_ASSETS,
  buildReleaseManifest,
  serializeReleaseManifest,
  verifyReleaseManifest,
} from "./release-manifest.mjs";

const temporaryRoots = [];

test.afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
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

test("production manifest covers every installer-consumed bundle asset", () => {
  assert.deepEqual(PRODUCTION_RELEASE_ASSETS, [
    "package.json",
    "compose.production.yml",
    "docker/production/Caddyfile",
    "docker/production/postgrest.conf",
    "docker/production/allowlists/api.env",
    "docker/production/allowlists/console.env",
    "docker/production/allowlists/migrate.env",
    "docker/production/allowlists/worker.env",
    "scripts/production/install.sh",
    "scripts/production/preflight.sh",
    "scripts/production/release-manifest.mjs",
    "scripts/production/smoke.mjs",
  ]);
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
