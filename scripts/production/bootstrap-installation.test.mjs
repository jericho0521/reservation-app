import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SETUP_TOKEN_TTL_MS,
  bootstrapInstallation,
  buildInstallationBootstrapSql,
  formatBootstrapOutput,
} from "./bootstrap-installation.mjs";

const installationId = "6ceafaa0-7862-4f92-a562-1f5082e2b9d8";
const domain = "book.example.com";
const setupToken = "s".repeat(43);
const setupTokenHash = createHash("sha256").update(setupToken).digest("hex");
const now = Date.parse("2026-07-15T04:00:00.000Z");

async function withProtectedConfig(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "reservation-bootstrap-"));
  try {
    await writeFile(path.join(directory, "release.env"), [
      `RESERVATION_DOMAIN=${domain}`,
      "RESERVATION_RELEASE=0.1.0",
      "RESERVATION_API_IMAGE=ghcr.io/example/api:0.1.0",
      "",
    ].join("\n"), { mode: 0o644 });
    await writeFile(path.join(directory, "installation-id"), installationId, { mode: 0o600 });
    await writeFile(path.join(directory, "setup-token"), setupToken, { mode: 0o600 });
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("first bootstrap inserts the installation tenant and singleton atomically with only a token hash", async () => {
  await withProtectedConfig(async (configDirectory) => {
    const invocations = [];
    const result = await bootstrapInstallation({
      configDirectory,
      databaseUrl: "postgresql://postgres@reservation-db:5432/reservation",
      now: () => now,
      runPsql: (input) => invocations.push(input),
    });

    assert.deepEqual(result, { status: "ready" });
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0].databaseUrl, "postgresql://postgres@reservation-db:5432/reservation");
    assert.match(invocations[0].sql, /pg_advisory_xact_lock/u);
    assert.match(invocations[0].sql, /insert into public\.tenants/u);
    assert.match(invocations[0].sql, /insert into public\.platform_installation/u);
    assert.match(invocations[0].sql, new RegExp(installationId, "u"));
    assert.match(invocations[0].sql, new RegExp(domain.replaceAll(".", String.raw`\.`), "u"));
    assert.match(invocations[0].sql, new RegExp(setupTokenHash, "u"));
    assert.match(
      invocations[0].sql,
      new RegExp(new Date(now + SETUP_TOKEN_TTL_MS).toISOString().replaceAll(".", String.raw`\.`), "u"),
    );
    assert.doesNotMatch(invocations[0].sql, new RegExp(setupToken, "u"));
  });
});

test("an identical restart is idempotent and does not rotate setup capability or expiry", () => {
  const sql = buildInstallationBootstrapSql({
    installationId,
    domain,
    setupTokenHash,
    setupExpiresAt: new Date(now + SETUP_TOKEN_TTL_MS).toISOString(),
  });

  assert.match(sql, /if existing_id <> desired_id[\s\S]*existing_tenant_id <> desired_tenant_id[\s\S]*existing_domain <> desired_domain/iu);
  assert.match(sql, /if found then[\s\S]*else[\s\S]*insert into public\.tenants/iu);
  assert.doesNotMatch(sql, /update public\.platform_installation/iu);
  assert.doesNotMatch(sql, /on conflict/iu);
});

test("an existing installation with a mismatched domain or identity is rejected", () => {
  const sql = buildInstallationBootstrapSql({
    installationId,
    domain,
    setupTokenHash,
    setupExpiresAt: new Date(now + SETUP_TOKEN_TTL_MS).toISOString(),
  });

  assert.match(sql, /raise exception 'Existing installation identity or domain does not match protected configuration'/u);
  assert.match(sql, /existing_id <> desired_id/u);
  assert.match(sql, /existing_domain <> desired_domain/u);
});

test("an expired setup timestamp remains expired after an exact restart", () => {
  const expiredAt = "2026-07-15T03:59:59.000Z";
  const sql = buildInstallationBootstrapSql({
    installationId,
    domain,
    setupTokenHash,
    setupExpiresAt: expiredAt,
  });

  assert.match(sql, new RegExp(expiredAt.replaceAll(".", String.raw`\.`), "u"));
  assert.doesNotMatch(sql, /setup_expires_at\s*=/iu);
  assert.doesNotMatch(sql, /setup_token_hash\s*=/iu);
});

test("bootstrap output and failure diagnostics never expose the plaintext setup token", async () => {
  assert.equal(formatBootstrapOutput({ status: "ready" }), "Installation bootstrap is ready.\n");
  assert.doesNotMatch(formatBootstrapOutput({ status: "ready" }), new RegExp(setupToken, "u"));

  await withProtectedConfig(async (configDirectory) => {
    await assert.rejects(
      bootstrapInstallation({
        configDirectory,
        databaseUrl: "postgresql://postgres@reservation-db:5432/reservation",
        now: () => now,
        runPsql: () => {
          throw new Error(`database rejected ${setupToken}`);
        },
      }),
      (error) => {
        assert.doesNotMatch(error.message, new RegExp(setupToken, "u"));
        assert.match(error.message, /Installation bootstrap failed/u);
        return true;
      },
    );
  });
});

test("bootstrap rejects exposed or symlinked protected identity files", async () => {
  await withProtectedConfig(async (configDirectory) => {
    const setupTokenPath = path.join(configDirectory, "setup-token");
    await chmod(setupTokenPath, 0o644);
    await assert.rejects(
      bootstrapInstallation({
        configDirectory,
        databaseUrl: "postgresql://postgres@reservation-db:5432/reservation",
        runPsql: () => undefined,
      }),
      /setup-token must use protected file permissions/u,
    );
  });

  await withProtectedConfig(async (configDirectory) => {
    const installationIdPath = path.join(configDirectory, "installation-id");
    const targetPath = path.join(configDirectory, "installation-id-target");
    await writeFile(targetPath, installationId, { mode: 0o600 });
    await unlink(installationIdPath);
    await symlink(targetPath, installationIdPath);
    await assert.rejects(
      bootstrapInstallation({
        configDirectory,
        databaseUrl: "postgresql://postgres@reservation-db:5432/reservation",
        runPsql: () => undefined,
      }),
      /installation-id must be a regular protected file/u,
    );
  });
});
