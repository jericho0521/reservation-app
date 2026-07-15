import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const script = new URL("./support-bundle.sh", import.meta.url).pathname;
const sanitizer = new URL("./support-bundle-sanitize.mjs", import.meta.url).pathname;

test("support bundle contains bounded allowlisted operations data and excludes sensitive fixture content", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "reservation-support-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = path.join(root, "fixture");
  const extracted = path.join(root, "extracted");
  const output = path.join(root, "support.tar.gz");
  await mkdir(fixture);
  await mkdir(extracted);

  const apiKey = ["sk", "private", "value"].join("-");
  const privateValues = [
    "Bearer private-authorization",
    apiKey,
    "pairing-code-private-qr",
    "reservation_session=private-cookie",
    "customer@example.com",
    "Please move my appointment and call me.",
  ];
  const unsafe = {
    authorization: privateValues[0],
    api_key: privateValues[1],
    qr: privateValues[2],
    cookie: privateValues[3],
    customer_email: privateValues[4],
    message_body: privateValues[5],
  };

  await writeFile(path.join(fixture, "versions.json"), JSON.stringify({
    release_version: "1.2.3",
    migration_version: "000036",
    ...unsafe,
  }));
  await writeFile(path.join(fixture, "compose.json"), JSON.stringify([{
    Name: "reservation-platform-production-reservation-api-1",
    Service: "reservation-api",
    State: "running",
    Health: "healthy",
    Image: "registry.example/reservation-api@sha256:123",
    Environment: [`API_KEY=${apiKey}`],
    Labels: unsafe,
  }]));
  await writeFile(path.join(fixture, "health.json"), JSON.stringify({
    status: "not_ready",
    components: { database: true, migrations: false },
    raw_error: `database unavailable for ${privateValues[4]}`,
    ...unsafe,
  }));
  await writeFile(path.join(fixture, "queue.json"), JSON.stringify({
    pending: 3,
    failed: 1,
    oldest_age_seconds: 40,
    ...unsafe,
  }));
  await writeFile(path.join(fixture, "disk.json"), JSON.stringify({
    filesystem: "/dev/vda1",
    capacity_kb: 1_000,
    used_kb: 650,
    available_kb: 350,
    used_percent: 65,
    mount_path: "/opt/reservation-platform",
    ...unsafe,
  }));
  await writeFile(path.join(fixture, "config-presence.json"), JSON.stringify({
    ai_configured: true,
    email_configured: false,
    whatsapp_configured: true,
    ai_api_key: apiKey,
    ...unsafe,
  }));
  const logs = Array.from({ length: 520 }, (_, index) => JSON.stringify({
    timestamp: `2026-07-15T00:${String(index % 60).padStart(2, "0")}:00Z`,
    level: "error",
    component: "worker",
    error_code: index === 519 ? "smtp_timeout" : "dependency_unavailable",
    job_kind: "notification.email",
    attempts: 3,
    ...unsafe,
  }));
  logs.push(JSON.stringify({ level: "info", component: "worker", event: "message.received", ...unsafe }));
  await writeFile(path.join(fixture, "logs.jsonl"), `${logs.join("\n")}\n`);

  execFileSync("bash", [script, "--output", output, "--fixture-dir", fixture], {
    env: { ...process.env, RESERVATION_RELEASE_VERSION: "ignored-secret-value" },
  });
  execFileSync("tar", ["-xzf", output, "-C", extracted]);

  assert.deepEqual((await readdir(extracted)).sort(), [
    "README.txt",
    "compose-status.json",
    "config-presence.json",
    "disk-summary.json",
    "health.json",
    "queue-counts.json",
    "recent-errors.ndjson",
    "versions.json",
  ]);
  const files = await readdir(extracted);
  const content = (await Promise.all(files.map((file) => readFile(path.join(extracted, file), "utf8")))).join("\n");
  for (const prohibited of [...privateValues, "ignored-secret-value", "authorization", "api_key", "customer_email", "message_body"]) {
    assert.equal(content.includes(prohibited), false, prohibited);
  }
  for (const expected of ["1.2.3", "000036", "smtp_timeout", "notification.email", "reservation-api", '"pending": 3', '"used_percent": 65']) {
    assert.equal(content.includes(expected), true, expected);
  }

  const recentErrors = (await readFile(path.join(extracted, "recent-errors.ndjson"), "utf8")).trim().split("\n");
  assert.equal(recentErrors.length, 500);
  assert.equal(recentErrors.some((line) => line.includes("message.received")), false);
  assert.equal((await stat(output)).mode & 0o777, 0o600);
});

test("sanitizer emits only documented keys and safely handles Compose arrays", () => {
  const versions = JSON.parse(execFileSync("node", [sanitizer, "versions"], {
    input: JSON.stringify({ release_version: ["sk", "private", "value"].join("-"), migration_version: "000036" }),
    encoding: "utf8",
  }));
  assert.deepEqual(versions, { release_version: "unknown", migration_version: "000036" });

  const compose = JSON.parse(execFileSync("node", [sanitizer, "compose"], {
    input: JSON.stringify([{ Name: "api-1", Service: "reservation-api", State: "running", Health: "healthy", Image: "api@sha256:123", Env: ["SECRET=value"] }]),
    encoding: "utf8",
  }));
  assert.deepEqual(Object.keys(compose[0]).sort(), ["health", "image", "service", "state"]);

  const status = JSON.parse(execFileSync("node", [sanitizer, "health"], {
    input: JSON.stringify({ status: "ready", components: { database: true, migrations: true }, message: "private" }),
    encoding: "utf8",
  }));
  assert.deepEqual(status, { status: "ready", components: { database: true, migrations: true } });

  const error = JSON.parse(execFileSync("node", [sanitizer, "logs"], {
    input: JSON.stringify({ level: "error", component: "api", event: "provider_failed", errorCode: "provider_timeout", jobKind: "conversation.process_ai", correlationId: "not-included" }),
    encoding: "utf8",
  }));
  assert.deepEqual(error, {
    level: "error",
    component: "api",
    event: "provider_failed",
    error_code: "provider_timeout",
    job_kind: "conversation.process_ai",
  });
});

test("production collection is bounded and never performs an unfiltered container inspection", async () => {
  const source = await readFile(script, "utf8");
  assert.match(source, /umask 077/u);
  assert.match(source, /logs[^\n]*--tail 500/u);
  assert.doesNotMatch(source, /docker\s+(?:compose\s+)?inspect/u);
});

test("operator workflow is wired through the root scripts and production tools container", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  const dockerfile = await readFile(new URL("../../Dockerfile.production-tools", import.meta.url), "utf8");
  const compose = await readFile(new URL("../../compose.production.yml", import.meta.url), "utf8");
  const releaseManifestSource = await readFile(new URL("./release-manifest.mjs", import.meta.url), "utf8");

  assert.equal(packageJson.scripts["production:support-bundle"], "bash scripts/production/support-bundle.sh");
  assert.match(packageJson.scripts["production:support-bundle:test"], /support-bundle\.test\.mjs/u);
  assert.match(packageJson.scripts["deploy:verify"], /production:support-bundle:test/u);
  assert.match(dockerfile, /apk add --no-cache[\s\S]*\bbash\b/u);
  assert.match(dockerfile, /COPY --chmod=0755 scripts\/production\/support-bundle\.sh/u);
  assert.match(dockerfile, /COPY scripts\/production\/support-bundle-sanitize\.mjs/u);
  assert.match(compose, /reservation-operations:[\s\S]*\/var\/run\/docker\.sock:\/var\/run\/docker\.sock/u);
  assert.match(compose, /reservation-operations:[\s\S]*\/opt\/reservation-installation/u);
  assert.match(releaseManifestSource, /"scripts\/production\/support-bundle\.sh"/u);
  assert.match(releaseManifestSource, /"scripts\/production\/support-bundle-sanitize\.mjs"/u);
});
