import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const consoleRoot = fileURLToPath(new URL("..", import.meta.url));
const standaloneRoot = path.join(consoleRoot, ".next/standalone");
const standaloneServer = path.join(standaloneRoot, "apps/console/server.js");
const middlewareManifest = path.join(
  standaloneRoot,
  "apps/console/.next/server/middleware-manifest.json",
);

test("built standalone console serves the installed admin base path without doubled redirects", {
  timeout: 30_000,
}, async (t) => {
  const manifest = JSON.parse(await readFile(middlewareManifest, "utf8"));
  assert.deepEqual(
    manifest.middleware["/"].matchers.map(({ originalSource }) => originalSource),
    ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
  );

  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const output = [];
  const child = spawn(process.execPath, [standaloneServer], {
    cwd: standaloneRoot,
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      RESERVATION_PLATFORM_BASE_URL: "http://127.0.0.1:1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  t.after(() => stop(child));

  await waitUntilReady(`${origin}/admin/login`, child, output);

  const login = await fetch(`${origin}/admin/login`, { redirect: "manual" });
  assert.equal(login.status, 200);

  const setup = await fetch(`${origin}/admin/setup`, { redirect: "manual" });
  assert.equal(setup.status, 200);
  assert.match(await setup.text(), /This setup link is invalid/u);

  const anonymous = await fetch(`${origin}/admin`, { redirect: "manual" });
  assert.ok([307, 308].includes(anonymous.status), `unexpected redirect status ${anonymous.status}`);
  const redirectLocation = new URL(assertRequired(anonymous.headers.get("location")), origin);
  assert.equal(redirectLocation.pathname, "/admin/login");
  assert.doesNotMatch(redirectLocation.pathname, /\/admin\/admin/u);

  const healthcheck = await fetch(`${origin}/admin`);
  assert.equal(healthcheck.ok, true);
  assert.equal(new URL(healthcheck.url).pathname, "/admin/login");
});

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitUntilReady(url, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      assert.fail(`standalone console exited with ${child.exitCode}:\n${output.join("")}`);
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status === 200) return;
    } catch {
      // The listener is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`standalone console did not become ready:\n${output.join("")}`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function assertRequired(value) {
  assert.ok(value);
  return value;
}
