import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { runProductionSmoke } from "./smoke.mjs";

const script = path.resolve("scripts/production/preflight.sh");

async function run(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(script, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function expectFailure(args, expected) {
  const result = await run(args);
  assert.equal(result.status, 64);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, `preflight: ${expected}\n`);
}

test("preflight rejects unsupported architectures deterministically", async () => {
  await expectFailure(["--probe-architecture", "i386"], "unsupported architecture: i386 (supported: x86_64)");
});

test("preflight accepts only documented Ubuntu releases", async () => {
  await expectFailure(
    ["--probe-os", "ubuntu", "20.04"],
    "supported operating system is Ubuntu 22.04 or 24.04 (detected: ubuntu 20.04)",
  );
  await expectFailure(
    ["--probe-os", "debian", "24.04"],
    "supported operating system is Ubuntu 22.04 or 24.04 (detected: debian 24.04)",
  );
  for (const version of ["22.04", "24.04"]) {
    const result = await run(["--probe-os", "ubuntu", version]);
    assert.equal(result.status, 0, result.stderr);
  }
});

test("preflight rejects hosts with less than 2 GiB memory", async () => {
  await expectFailure(["--probe-memory-kib", "2097151"], "at least 2 GiB memory is required (detected: 2097151 KiB)");
});

test("preflight rejects hosts with less than 2 CPU cores", async () => {
  await expectFailure(["--probe-cpu-count", "1"], "at least 2 CPU cores are required (detected: 1)");
});

test("preflight rejects hosts with less than 10 GiB free disk", async () => {
  await expectFailure(["--probe-disk-kib", "10485759"], "at least 10 GiB free disk is required (detected: 10485759 KiB)");
});

test("preflight rejects missing or non-v2 Docker Compose", async () => {
  await expectFailure(["--probe-compose-version", "missing"], "Docker Compose v2 is required");
  await expectFailure(["--probe-compose-version", "1.29.2"], "Docker Compose v2 is required");
});

test("preflight reports the occupied public port", async () => {
  await expectFailure(["--probe-ports", "80"], "TCP port 80 is already in use");
  await expectFailure(["--probe-ports", "443"], "TCP port 443 is already in use");
  await expectFailure(["--probe-ports", "443/udp"], "UDP port 443 is already in use");
});

test("preflight rejects an invalid normalized domain without echoing it", async () => {
  const token = "secret-setup-token-that-must-not-leak";
  const result = await run(["--probe-domain", `https://book.example.com/admin/setup?token=${token}`], {
    RESERVATION_SETUP_TOKEN: token,
  });
  assert.equal(result.status, 64);
  assert.equal(result.stderr, "preflight: domain must be a normalized ASCII DNS name\n");
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(token, "u"));
});

test("preflight rejects DNS that does not resolve to the host", async () => {
  await expectFailure(
    ["--probe-dns", "book.example.com", "203.0.113.10", "203.0.113.11,203.0.113.12"],
    "DNS for book.example.com does not resolve to host IP 203.0.113.10",
  );
  await expectFailure(
    ["--probe-dns", "book.example.com", "not-an-ip", "203.0.113.10"],
    "host IP must be a public IPv4 address",
  );
});

test("deterministic probes accept the supported boundary values", async () => {
  for (const args of [
    ["--probe-architecture", "x86_64"],
    ["--probe-cpu-count", "2"],
    ["--probe-memory-kib", "2097152"],
    ["--probe-disk-kib", "10485760"],
    ["--probe-compose-version", "2.39.1"],
    ["--probe-ports", "none"],
    ["--probe-domain", "book.example.com"],
    ["--probe-dns", "book.example.com", "203.0.113.10", "203.0.113.11,203.0.113.10"],
  ]) {
    const result = await run(args);
    assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
    assert.equal(result.stderr, "");
  }
});

test("installer preserves the fixed production startup order and keeps the token off argv", async () => {
  const [installer, compose] = await Promise.all([
    readFile("scripts/production/install.sh", "utf8"),
    readFile("compose.production.yml", "utf8"),
  ]);
  const ordered = [
    "# INSTALL_STEP: preflight",
    "# INSTALL_STEP: create-target",
    "# INSTALL_STEP: copy-assets",
    "# INSTALL_STEP: configure",
    "# INSTALL_STEP: pull-images",
    "# INSTALL_STEP: start-database",
    "# INSTALL_STEP: migrate",
    "# INSTALL_STEP: start-private-services",
    "# INSTALL_STEP: start-edge",
    "# INSTALL_STEP: wait-readiness",
    "# INSTALL_STEP: print-setup-url",
  ];
  let previous = -1;
  for (const marker of ordered) {
    const position = installer.indexOf(marker);
    assert.ok(position > previous, marker);
    previous = position;
  }
  assert.match(installer, /--setup-token-stdin/u);
  assert.match(
    installer,
    /setup_token=\$\(production_compose run --rm --no-deps --entrypoint \/bin\/cat reservation-config \/run\/reservation-config\/setup-token\)/u,
  );
  assert.doesNotMatch(installer, /--setup-token[= ]+"?\$setup_token/u);
  assert.doesNotMatch(installer, /set -x/u);
  assert.doesNotMatch(installer, /docker compose[^\n]*build/u);
  const configService = compose.slice(
    compose.indexOf("  reservation-config:"),
    compose.indexOf("  reservation-db:"),
  );
  assert.match(configService, /logging:\n      driver: "none"/u);
});

test("installer resume stops only its matching edge before the default port preflight", async () => {
  const installer = await readFile("scripts/production/install.sh", "utf8");
  const resume = installer.indexOf("--resume");
  const captureEdge = installer.indexOf("resume_edge_id=$existing_edge");
  const rollbackTrap = installer.indexOf("trap rollback_edge 0");
  const stopEdge = installer.indexOf("stop reservation-edge");
  const preflight = installer.indexOf("# INSTALL_STEP: preflight");
  const startEdge = installer.indexOf("# INSTALL_STEP: start-edge");
  const restartExactEdge = installer.indexOf('docker start "$resume_edge_id"', startEdge);
  const clearTrap = installer.indexOf("trap - 0", startEdge);
  assert.ok(resume >= 0);
  assert.ok(captureEdge > resume && rollbackTrap > captureEdge && stopEdge > rollbackTrap && stopEdge < preflight);
  assert.ok(restartExactEdge > startEdge && clearTrap > restartExactEdge);
  assert.equal((installer.match(/docker start "\$resume_edge_id"/gu) ?? []).length, 2);
  assert.match(installer, /existing release\.env does not match the requested domain and release/u);
  assert.match(installer, /com\.docker\.compose\.project\.working_dir/u);
  assert.match(installer, /edge_running=\$\(docker inspect[^\n]*"\$resume_edge_id"/u);
  assert.doesNotMatch(installer, /docker compose[^\n]*(?:down|rm)/u);
});

test("installer verifies the exact release bundle before creating the target", async () => {
  const [installer, toolsDockerfile] = await Promise.all([
    readFile("scripts/production/install.sh", "utf8"),
    readFile("Dockerfile.production-tools", "utf8"),
  ]);
  const verify = installer.indexOf("release-manifest.mjs --check");
  const createTarget = installer.indexOf("# INSTALL_STEP: create-target");
  assert.ok(verify >= 0 && verify < createTarget);
  assert.match(installer, /docker pull "\$tools_image"/u);
  assert.match(installer, /--network none/u);
  assert.match(installer, /src=\$SOURCE_ROOT,dst=\/bundle,readonly/u);
  assert.match(installer, /--manifest \/bundle\/release-manifest\.json/u);
  assert.match(installer, /--release "\$release"/u);
  assert.match(toolsDockerfile, /COPY scripts\/production\/release-manifest\.mjs \.\/release-manifest\.mjs/u);
});

function smokeFetch(overrides = {}) {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    calls.push(`${url.pathname}${url.search}`);
    const response = overrides[url.pathname] ?? {
      status: 200,
      body: url.pathname === "/admin/setup"
        ? "Infrastructure is ready"
        : url.pathname === "/"
          ? "Open a business booking link."
          : "ok",
    };
    return new Response(response.body, { status: response.status });
  };
  return { calls, fetchImpl };
}

test("production smoke requires health, setup-safe root, and absent demo slugs", async () => {
  const token = "A".repeat(43);
  const { calls, fetchImpl } = smokeFetch({
    "/apex-racing-demo": { status: 404, body: "not found" },
    "/v1/public/experiences/apex-racing-demo": { status: 404, body: "not found" },
  });
  const result = await runProductionSmoke({
    origin: "https://book.example.com",
    setupToken: token,
    fetchImpl,
    waitMilliseconds: 0,
  });

  assert.deepEqual(result, { origin: "https://book.example.com", checks: 6 });
  assert.deepEqual(calls, [
    "/v1/health/live",
    "/v1/health/ready",
    `/admin/setup?token=${token}`,
    "/",
    "/apex-racing-demo",
    "/v1/public/experiences/apex-racing-demo",
  ]);
});

test("production smoke retries readiness and never includes the setup token in errors", async () => {
  const token = "B".repeat(43);
  let readyAttempts = 0;
  let clock = 0;
  const { fetchImpl: successfulFetch } = smokeFetch({
    "/apex-racing-demo": { status: 404, body: "not found" },
    "/v1/public/experiences/apex-racing-demo": { status: 404, body: "not found" },
  });
  const retryingFetch = async (input, init) => {
    if (new URL(input).pathname === "/v1/health/ready" && readyAttempts++ === 0) {
      return new Response("starting", { status: 503 });
    }
    return successfulFetch(input, init);
  };
  await runProductionSmoke({
    origin: "https://book.example.com",
    setupToken: token,
    fetchImpl: retryingFetch,
    waitMilliseconds: 5_000,
    now: () => clock,
    sleep: async (milliseconds) => { clock += milliseconds; },
  });
  assert.equal(readyAttempts, 2);

  const { fetchImpl } = smokeFetch({
    "/apex-racing-demo": { status: 200, body: token },
  });
  await assert.rejects(
    runProductionSmoke({
      origin: "https://book.example.com",
      setupToken: token,
      fetchImpl,
      waitMilliseconds: 0,
    }),
    (error) => {
      assert.match(error.message, /must return 404/u);
      assert.doesNotMatch(error.message, new RegExp(token, "u"));
      return true;
    },
  );
});
