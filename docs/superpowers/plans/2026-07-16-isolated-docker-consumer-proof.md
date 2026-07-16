# Isolated Docker Consumer Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repeatable clean-room Docker E2E proof that validates the reservation platform as both an appointment-business product and an independently consumed SDK.

**Architecture:** A tracked harness under `tests/consumer-docker-e2e/` builds five local release images and two package tarballs, materializes a disposable consumer workspace under the operating-system temporary directory, and starts the production Compose topology with a proof-only HTTPS edge and local provider substitutes. Playwright, public HTTP clients, restart/restore checks, and an isolated SDK application produce one redacted evidence bundle and clean up only the generated Compose projects.

**Tech Stack:** TypeScript 5, Node.js 20+, pnpm 10.33.2, Docker Engine, Docker Compose v2, PostgreSQL 16, Caddy 2, Playwright 1.61, Mailpit, Vercel AI SDK/OpenAI-compatible HTTP, Node test runner.

## Global Constraints

- The authoritative design is `docs/superpowers/specs/2026-07-16-isolated-docker-consumer-proof-design.md`.
- Use plain `pnpm`; no executable repository script may invoke `corepack pnpm`.
- Do not run `scripts/local-stack-seed.mjs` or reuse the loopback browser fixture credentials.
- Application containers must use locally built release images and must not bind-mount repository source.
- Every host port must bind to `127.0.0.1`; database, PostgREST, worker, SMTP, and AI provider ports stay private.
- Only the existing `reservation-operations` recovery profile may mount `/var/run/docker.sock`, and only during the bounded backup/restore stage.
- The generated Compose project names must match `^reservation-consumer-proof-[a-f0-9]{12}(?:-restore)?$`.
- Generated credentials must never appear in argv, logs, screenshots, traces, JSON evidence, or Markdown evidence.
- Real Baileys pairing remains manual and must never be marked passed by simulation.
- The live Docker proof is opt-in; deterministic harness tests join `pnpm run ci:verify`.
- Preserve `.superpowers/` and `tmp/`; never stage or delete them.

## File Map

| Path | Responsibility |
|---|---|
| `tests/consumer-docker-e2e/contract.test.mjs` | Static root-script, topology, migration, and isolation contract |
| `tests/consumer-docker-e2e/support/context.mjs` | Run identifiers, paths, ports, image names, and Compose argv |
| `tests/consumer-docker-e2e/support/preflight.mjs` | Docker/Compose, port, tool, and repository input validation |
| `tests/consumer-docker-e2e/support/artifacts.mjs` | Local image builds and SDK/contract package packing |
| `tests/consumer-docker-e2e/support/materialize.mjs` | Disposable consumer directory and protected environment creation |
| `tests/consumer-docker-e2e/support/process.mjs` | Injected, bounded subprocess execution without secrets in argv |
| `tests/consumer-docker-e2e/support/evidence.mjs` | Run-state recording, redaction, JSON/Markdown evidence |
| `tests/consumer-docker-e2e/support/cleanup.mjs` | Exact-project cleanup and signal-safe teardown |
| `tests/consumer-docker-e2e/support/mailpit.ts` | Bounded Mailpit message-category queries |
| `tests/consumer-docker-e2e/support/consumer-context.ts` | Shared Playwright URLs, accounts, and created identifiers |
| `tests/consumer-docker-e2e/providers/deterministic-openai.mjs` | Minimal OpenAI-compatible deterministic provider |
| `tests/consumer-docker-e2e/compose.override.yml` | Local HTTPS edge, Mailpit, provider stub, and production overrides |
| `tests/consumer-docker-e2e/Caddyfile` | Localhost HTTPS routing with Caddy internal TLS |
| `tests/consumer-docker-e2e/playwright.config.ts` | Serial consumer projects and isolated result paths |
| `tests/consumer-docker-e2e/journeys/*.spec.ts` | Installation, owner, staff, customer, channel, and recovery journeys |
| `tests/consumer-docker-e2e/developer-app/*` | Independent packed-SDK consumer source and boundary verification |
| `tests/consumer-docker-e2e/scripts/run.mjs` | End-to-end phase state machine |
| `tests/consumer-docker-e2e/README.md` | Operator prerequisites, commands, output, and limitations |

---

### Task 1: Lock the Consumer-Proof Contract and Current Migration Version

**Files:**
- Create: `tests/consumer-docker-e2e/contract.test.mjs`
- Modify: `package.json`
- Modify: `compose.production.yml:130`
- Test: `tests/consumer-docker-e2e/contract.test.mjs`

**Interfaces:**
- Consumes: `scripts/production/release-manifest.mjs` export `SUPPORTED_RELEASE_MIGRATION_VERSION`.
- Produces: root scripts `test:consumer-docker:harness`, `test:consumer-docker:preflight`, `test:consumer-docker`, `test:consumer-docker:keep`, and `test:consumer-docker:developer`.

- [ ] **Step 1: Write the failing topology and script contract**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SUPPORTED_RELEASE_MIGRATION_VERSION } from "../../scripts/production/release-manifest.mjs";

test("consumer proof scripts are explicit and use plain pnpm", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(packageJson.scripts["test:consumer-docker:harness"], "node --test tests/consumer-docker-e2e/*.test.mjs tests/consumer-docker-e2e/support/*.test.mjs tests/consumer-docker-e2e/providers/*.test.mjs");
  assert.equal(packageJson.scripts["test:consumer-docker:preflight"], "node tests/consumer-docker-e2e/scripts/run.mjs --preflight");
  assert.equal(packageJson.scripts["test:consumer-docker"], "node tests/consumer-docker-e2e/scripts/run.mjs");
  assert.equal(packageJson.scripts["test:consumer-docker:keep"], "node tests/consumer-docker-e2e/scripts/run.mjs --keep");
  assert.equal(packageJson.scripts["test:consumer-docker:developer"], "node tests/consumer-docker-e2e/developer-app/verify.mjs");
  assert.doesNotMatch(JSON.stringify(packageJson.scripts), /corepack\s+pnpm/u);
});

test("production API readiness requires the current core migration", async () => {
  const compose = await readFile("compose.production.yml", "utf8");
  assert.match(compose, new RegExp(`RESERVATION_REQUIRED_MIGRATION_VERSION: "${SUPPORTED_RELEASE_MIGRATION_VERSION}"`, "u"));
});

test("only the operations profile receives the Docker socket", async () => {
  const compose = await readFile("compose.production.yml", "utf8");
  const socketMatches = compose.match(/\/var\/run\/docker\.sock/gmu) ?? [];
  assert.equal(socketMatches.length, 1);
  assert.match(compose, /reservation-operations:[\s\S]*profiles: \["operations"\][\s\S]*\/var\/run\/docker\.sock/u);
});
```

- [ ] **Step 2: Run the contract and observe the migration drift**

Run: `node --test tests/consumer-docker-e2e/contract.test.mjs`

Expected: FAIL because the root scripts are absent and `compose.production.yml` still requires `000036` while the release contract requires `000037`.

- [ ] **Step 3: Add the five root scripts and align production readiness**

Add these exact entries to `package.json` without changing unrelated scripts:

```json
"test:consumer-docker:harness": "node --test tests/consumer-docker-e2e/*.test.mjs tests/consumer-docker-e2e/support/*.test.mjs tests/consumer-docker-e2e/providers/*.test.mjs",
"test:consumer-docker:preflight": "node tests/consumer-docker-e2e/scripts/run.mjs --preflight",
"test:consumer-docker": "node tests/consumer-docker-e2e/scripts/run.mjs",
"test:consumer-docker:keep": "node tests/consumer-docker-e2e/scripts/run.mjs --keep",
"test:consumer-docker:developer": "node tests/consumer-docker-e2e/developer-app/verify.mjs"
```

Change the API environment in `compose.production.yml` to:

```yaml
RESERVATION_REQUIRED_MIGRATION_VERSION: "000037"
```

- [ ] **Step 4: Run focused contracts and production verification**

Run: `node --test tests/consumer-docker-e2e/contract.test.mjs && pnpm run production:release-manifest:check && pnpm run production:verify`

Expected: PASS; production topology still reports 11 services with edge-only publishing.

- [ ] **Step 5: Commit**

```bash
git add package.json compose.production.yml tests/consumer-docker-e2e/contract.test.mjs
git commit -m "test(consumer): lock Docker proof contract"
```

### Task 2: Build the Run Context, Process Boundary, and Preflight

**Files:**
- Create: `tests/consumer-docker-e2e/support/context.mjs`
- Create: `tests/consumer-docker-e2e/support/context.test.mjs`
- Create: `tests/consumer-docker-e2e/support/process.mjs`
- Create: `tests/consumer-docker-e2e/support/preflight.mjs`
- Create: `tests/consumer-docker-e2e/support/preflight.test.mjs`
- Create: `tests/consumer-docker-e2e/scripts/run.mjs`

**Interfaces:**
- Produces: `createConsumerContext(options): ConsumerContext`, `composeArgs(context, ...args): string[]`, `runBounded(command, args, options)`, and `verifyConsumerPreflight(context, adapters)`.
- `ConsumerContext` contains `runId`, `projectName`, `restoreProjectName`, `workspace`, `artifactsDirectory`, `evidenceDirectory`, `edgeOrigin`, `mailpitOrigin`, `composeFiles`, `composeEnvironment`, and `keep`.

- [ ] **Step 1: Write failing context and preflight tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { composeArgs, createConsumerContext } from "./context.mjs";

test("context owns exact isolated projects and loopback origins", () => {
  const context = createConsumerContext({ repoRoot: "/repo", temporaryRoot: "/tmp", runId: "abcdef123456", edgePort: 4543, mailpitPort: 48025 });
  assert.equal(context.projectName, "reservation-consumer-proof-abcdef123456");
  assert.equal(context.restoreProjectName, "reservation-consumer-proof-abcdef123456-restore");
  assert.equal(context.edgeOrigin, "https://localhost:4543");
  assert.equal(context.mailpitOrigin, "http://127.0.0.1:48025");
  assert.deepEqual(composeArgs(context, "ps", "--format", "json").slice(-3), ["ps", "--format", "json"]);
});

test("context rejects attacker-controlled identifiers", () => {
  assert.throws(() => createConsumerContext({ repoRoot: "/repo", temporaryRoot: "/tmp", runId: "../../bad" }), /run identifier/u);
});
```

```js
import assert from "node:assert/strict";
import test from "node:test";
import { verifyConsumerPreflight } from "./preflight.mjs";

test("preflight accepts Compose v2 and unused loopback ports", async () => {
  const result = await verifyConsumerPreflight({ edgePort: 4543, mailpitPort: 48025, repoRoot: "/repo" }, {
    commandVersion: async (_command, args) => args.includes("compose") ? "v2.35.1" : "Docker version 27.0.0",
    portAvailable: async () => true,
    pathExists: async () => true,
  });
  assert.deepEqual(result, { ok: true, docker: "27.0.0", compose: "2.35.1" });
});

test("preflight names an occupied port without starting Docker", async () => {
  const result = await verifyConsumerPreflight({ edgePort: 4543, mailpitPort: 48025, repoRoot: "/repo" }, {
    commandVersion: async () => "2.35.1",
    portAvailable: async (port) => port !== 4543,
    pathExists: async () => true,
  });
  assert.deepEqual(result, { ok: false, code: "port_occupied", port: 4543 });
});
```

- [ ] **Step 2: Run the tests and verify missing modules fail**

Run: `node --test tests/consumer-docker-e2e/support/context.test.mjs tests/consumer-docker-e2e/support/preflight.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `context.mjs` and `preflight.mjs`.

- [ ] **Step 3: Implement the exact context boundary**

```js
// support/context.mjs
import { randomBytes } from "node:crypto";
import path from "node:path";

const RUN_ID = /^[a-f0-9]{12}$/u;

export function createConsumerContext(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const temporaryRoot = path.resolve(options.temporaryRoot ?? process.env.TMPDIR ?? "/tmp");
  const runId = options.runId ?? randomBytes(6).toString("hex");
  if (!RUN_ID.test(runId)) throw new Error("Consumer proof run identifier is invalid.");
  const workspace = path.join(temporaryRoot, "reservation-platform-consumer-proof", runId);
  const edgePort = options.edgePort ?? 4543;
  const mailpitPort = options.mailpitPort ?? 48025;
  const projectName = `reservation-consumer-proof-${runId}`;
  return Object.freeze({
    repoRoot, runId, workspace, projectName,
    restoreProjectName: `${projectName}-restore`,
    artifactsDirectory: path.join(workspace, "artifacts"),
    installationDirectory: path.join(workspace, "installation"),
    restoreDirectory: path.join(workspace, "restore"),
    evidenceDirectory: path.join(workspace, "evidence"),
    edgePort, mailpitPort,
    edgeOrigin: `https://localhost:${edgePort}`,
    mailpitOrigin: `http://127.0.0.1:${mailpitPort}`,
    keep: options.keep === true,
  });
}

export function composeArgs(context, ...args) {
  return [
    "compose", "--project-name", context.projectName,
    "--project-directory", context.installationDirectory,
    "--env-file", path.join(context.installationDirectory, "release.env"),
    "-f", path.join(context.installationDirectory, "compose.production.yml"),
    "-f", path.join(context.installationDirectory, "compose.override.yml"),
    ...args,
  ];
}
```

- [ ] **Step 4: Implement bounded process execution and preflight**

`runBounded` must accept `{ cwd, env, input, timeoutMs, maxOutputBytes }`, use `spawn`, kill on timeout, cap stdout/stderr independently, and return `{ status, stdout, stderr, timedOut }`. It must never interpolate environment values into an error message.

```js
// support/preflight.mjs
import { access } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { runBounded } from "./process.mjs";

const requiredInputs = ["compose.production.yml", "Dockerfile", "Dockerfile.web", "Dockerfile.production-tools", "pnpm-lock.yaml"];

export async function verifyConsumerPreflight(context, adapters = {}) {
  const commandVersion = adapters.commandVersion ?? defaultCommandVersion;
  const portAvailable = adapters.portAvailable ?? defaultPortAvailable;
  const pathExists = adapters.pathExists ?? defaultPathExists;
  const dockerSource = await commandVersion("docker", ["--version"]);
  const composeSource = await commandVersion("docker", ["compose", "version", "--short"]);
  const docker = dockerSource.match(/\d+\.\d+\.\d+/u)?.[0];
  const compose = composeSource.match(/\d+\.\d+\.\d+/u)?.[0];
  if (!docker) return { ok: false, code: "docker_unavailable" };
  if (!compose || Number(compose.split(".")[0]) < 2) return { ok: false, code: "compose_v2_required" };
  for (const port of [context.edgePort, context.mailpitPort]) {
    if (!await portAvailable(port)) return { ok: false, code: "port_occupied", port };
  }
  for (const relativePath of requiredInputs) {
    if (!await pathExists(path.join(context.repoRoot, relativePath))) return { ok: false, code: "missing_input", path: relativePath };
  }
  return { ok: true, docker, compose };
}

async function defaultCommandVersion(command, args) {
  const result = await runBounded(command, args, { timeoutMs: 10_000, maxOutputBytes: 4_096 });
  return result.status === 0 ? result.stdout.trim() : "";
}
async function defaultPathExists(value) { try { await access(value); return true; } catch { return false; } }
async function defaultPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port }, () => server.close(() => resolve(true)));
  });
}
```

- [ ] **Step 5: Add a preflight-only runner path**

`scripts/run.mjs` must parse only `--preflight` and `--keep`, create the context, run preflight first, print one JSON object, and exit nonzero on failure. Unknown flags must return a usage error without starting Docker.

- [ ] **Step 6: Run focused tests and preflight**

Run: `pnpm run test:consumer-docker:harness && pnpm run test:consumer-docker:preflight`

Expected: all harness tests PASS; preflight prints `{"status":"ready",...}` on a machine with Docker and free ports.

- [ ] **Step 7: Commit**

```bash
git add tests/consumer-docker-e2e/support tests/consumer-docker-e2e/scripts/run.mjs
git commit -m "test(consumer): add isolated proof preflight"
```

### Task 3: Build and Materialize Release Artifacts

**Files:**
- Create: `tests/consumer-docker-e2e/support/artifacts.mjs`
- Create: `tests/consumer-docker-e2e/support/artifacts.test.mjs`
- Create: `tests/consumer-docker-e2e/support/materialize.mjs`
- Create: `tests/consumer-docker-e2e/support/materialize.test.mjs`
- Create: `tests/consumer-docker-e2e/developer-app/package.template.json`
- Create: `tests/consumer-docker-e2e/developer-app/tsconfig.json`

**Interfaces:**
- Produces: `buildConsumerArtifacts(context, adapters): ArtifactManifest` and `materializeConsumerWorkspace(context, manifest): MaterializedConsumer`.
- `ArtifactManifest.images` contains exact local tags for `api`, `worker`, `console`, `booking`, and `tools`; `imageIds` binds each tag to its observed `sha256:` image ID; `packages` contains absolute copied tarball paths for `sdk` and `contractTypes`.

- [ ] **Step 1: Write failing artifact and materialization tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { imageBuildPlan } from "./artifacts.mjs";

test("artifact plan builds every production component from explicit targets", () => {
  assert.deepEqual(imageBuildPlan("abcdef123456"), [
    { name: "api", dockerfile: "Dockerfile", target: "runtime", tag: "reservation-platform-api:consumer-abcdef123456" },
    { name: "worker", dockerfile: "Dockerfile", target: "worker-runtime", tag: "reservation-platform-worker:consumer-abcdef123456" },
    { name: "console", dockerfile: "Dockerfile.web", target: "console-runtime", tag: "reservation-platform-console:consumer-abcdef123456" },
    { name: "booking", dockerfile: "Dockerfile.web", target: "booking-runtime", tag: "reservation-platform-booking:consumer-abcdef123456" },
    { name: "tools", dockerfile: "Dockerfile.production-tools", target: undefined, tag: "reservation-platform-tools:consumer-abcdef123456" },
  ]);
});
```

```js
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createConsumerContext } from "./context.mjs";
import { materializeConsumerWorkspace } from "./materialize.mjs";

test("materializer writes local images without workspace dependencies", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "consumer-materialize-"));
  const repoRoot = process.cwd();
  const context = createConsumerContext({ repoRoot, temporaryRoot, runId: "abcdef123456" });
  const manifest = {
    commit: "a".repeat(40),
    images: Object.fromEntries(["api", "worker", "console", "booking", "tools"].map((name) => [name, `reservation-platform-${name}:consumer-abcdef123456`])),
    imageIds: Object.fromEntries(["api", "worker", "console", "booking", "tools"].map((name, index) => [name, `sha256:${String(index + 1).repeat(64)}`])),
    packages: {
      sdk: path.join(repoRoot, "tests/fixtures/sdk.tgz"),
      contractTypes: path.join(repoRoot, "tests/fixtures/contract-types.tgz"),
    },
  };
  const result = await materializeConsumerWorkspace(context, manifest, {
    copyInstallationInputs: async () => undefined,
    copyPackageArtifacts: async () => undefined,
  });
  const release = await readFile(result.releaseEnvironmentPath, "utf8");
  assert.match(release, /^RESERVATION_API_IMAGE=reservation-platform-api:consumer-abcdef123456$/mu);
  assert.doesNotMatch(release, /workspace:|ghcr\.io/u);
  assert.equal((await stat(context.installationDirectory)).mode & 0o777, 0o700);
  assert.equal((await stat(result.releaseEnvironmentPath)).mode & 0o777, 0o600);
});
```

- [ ] **Step 2: Run tests and confirm missing implementations**

Run: `node --test tests/consumer-docker-e2e/support/artifacts.test.mjs tests/consumer-docker-e2e/support/materialize.test.mjs`

Expected: FAIL with missing module errors.

- [ ] **Step 3: Implement the immutable local build plan**

```js
export function imageBuildPlan(runId) {
  const prefix = `consumer-${runId}`;
  return [
    { name: "api", dockerfile: "Dockerfile", target: "runtime", tag: `reservation-platform-api:${prefix}` },
    { name: "worker", dockerfile: "Dockerfile", target: "worker-runtime", tag: `reservation-platform-worker:${prefix}` },
    { name: "console", dockerfile: "Dockerfile.web", target: "console-runtime", tag: `reservation-platform-console:${prefix}` },
    { name: "booking", dockerfile: "Dockerfile.web", target: "booking-runtime", tag: `reservation-platform-booking:${prefix}` },
    { name: "tools", dockerfile: "Dockerfile.production-tools", target: undefined, tag: `reservation-platform-tools:${prefix}` },
  ];
}
```

`buildConsumerArtifacts` must run each Docker build with an argv array equivalent to `docker build --file <dockerfile> [--target <target>] --tag <tag> .`, inspect each built tag with `docker image inspect --format {{.Id}} <tag>`, require a `sha256:` ID, run `pnpm --filter @reservation-platform/contract-types pack --pack-destination <dir>` and `pnpm --filter @reservation-platform/sdk pack --pack-destination <dir>`, then write `artifacts.json` with commit SHA, tag-to-image-ID bindings, and tarball SHA-256 checksums. Re-inspect image IDs immediately before Compose startup and fail if any tag changed. Reject missing or multiple matching tarballs.

- [ ] **Step 4: Implement materialization without repository runtime links**

Copy exactly these tracked inputs into the generated installation:

```js
export const installationInputs = Object.freeze([
  "compose.production.yml",
  "docker/production/Caddyfile",
  "docker/production/postgrest.conf",
  "docker/production/allowlists/api.env",
  "docker/production/allowlists/migrate.env",
  "docker/production/allowlists/worker.env",
  "tests/consumer-docker-e2e/compose.override.yml",
  "tests/consumer-docker-e2e/Caddyfile",
  "tests/consumer-docker-e2e/providers/deterministic-openai.mjs",
]);
```

Write `release.env` with release `0.2.0`, domain `consumer.reservation.test`, the five local image tags, an absolute backup directory, the generated installation directory, `RESERVATION_CONSUMER_EDGE_PORT`, and `RESERVATION_CONSUMER_MAILPIT_PORT`. Copy package tarballs below `developer-app/artifacts/`; do not symlink them.

- [ ] **Step 5: Add the independent package template**

```json
{
  "name": "reservation-platform-consumer-proof-app",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.33.2",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@reservation-platform/contract-types": "__CONTRACT_TARBALL__",
    "@reservation-platform/sdk": "__SDK_TARBALL__"
  },
  "devDependencies": {
    "tsx": "^4.21.0",
    "typescript": "^5"
  }
}
```

- [ ] **Step 6: Run focused tests and a dry materialization**

Run: `node --test tests/consumer-docker-e2e/support/artifacts.test.mjs tests/consumer-docker-e2e/support/materialize.test.mjs`

Expected: PASS; temporary output contains copied regular files, protected environment metadata, and no symlink or workspace dependency.

- [ ] **Step 7: Commit**

```bash
git add tests/consumer-docker-e2e/support tests/consumer-docker-e2e/developer-app
git commit -m "test(consumer): materialize release artifacts"
```

### Task 4: Add the Local HTTPS Edge and Provider Substitutes

**Files:**
- Create: `tests/consumer-docker-e2e/compose.override.yml`
- Create: `tests/consumer-docker-e2e/Caddyfile`
- Create: `tests/consumer-docker-e2e/providers/deterministic-openai.mjs`
- Create: `tests/consumer-docker-e2e/providers/deterministic-openai.test.mjs`
- Extend: `tests/consumer-docker-e2e/contract.test.mjs`

**Interfaces:**
- Provider routes: `GET /v1/models`, `POST /v1/chat/completions`, `POST /v1/responses`, `POST /__proof/mode`.
- Provider modes: `success`, `rate_limit`, `timeout`, `malformed`, `provider_error`.
- Consumer origins: edge `https://localhost:${RESERVATION_CONSUMER_EDGE_PORT}` and Mailpit `http://127.0.0.1:${RESERVATION_CONSUMER_MAILPIT_PORT}`.

- [ ] **Step 1: Write failing provider and Compose contracts**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createDeterministicProvider } from "./deterministic-openai.mjs";

test("provider returns a bounded OpenAI-compatible success", async () => {
  const provider = createDeterministicProvider({ expectedKey: "consumer-proof-key" });
  const response = await provider.handle(new Request("http://provider/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer consumer-proof-key", "content-type": "application/json" },
    body: JSON.stringify({ model: "consumer-proof-model", messages: [{ role: "user", content: "availability" }] }),
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.choices[0].message.content.includes("consumer-proof"), true);
});

test("provider rejects credentials without reflecting them", async () => {
  const provider = createDeterministicProvider({ expectedKey: "consumer-proof-key" });
  const response = await provider.handle(new Request("http://provider/v1/models", { headers: { authorization: "Bearer wrong-secret" } }));
  assert.equal(response.status, 401);
  assert.doesNotMatch(await response.text(), /wrong-secret|consumer-proof-key/u);
});
```

Extend `contract.test.mjs` to assert the override disables the production edge behind profile `external-edge`, binds only consumer edge and Mailpit HTTP to `127.0.0.1`, keeps provider/SMTP ports unpublished, adds no source application mounts, and leaves the Docker socket only on `reservation-operations`.

- [ ] **Step 2: Run provider and contract tests**

Run: `node --test tests/consumer-docker-e2e/providers/deterministic-openai.test.mjs tests/consumer-docker-e2e/contract.test.mjs`

Expected: FAIL because provider, Caddyfile, and Compose override do not exist.

- [ ] **Step 3: Implement the deterministic provider**

Create an HTTP handler that:

```js
export const providerModes = new Set(["success", "rate_limit", "timeout", "malformed", "provider_error"]);

export function createDeterministicProvider({ expectedKey, initialMode = "success" }) {
  let mode = initialMode;
  return {
    async handle(request) {
      const url = new URL(request.url);
      if (url.pathname === "/__proof/mode" && request.method === "POST") {
        const next = (await request.json()).mode;
        if (!providerModes.has(next)) return Response.json({ error: "invalid_mode" }, { status: 400 });
        mode = next;
        return Response.json({ mode });
      }
      if (request.headers.get("authorization") !== `Bearer ${expectedKey}`) return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
      if (mode === "rate_limit") return Response.json({ error: { message: "Rate limited" } }, { status: 429, headers: { "retry-after": "1" } });
      if (mode === "provider_error") return Response.json({ error: { message: "Provider unavailable" } }, { status: 503 });
      if (mode === "malformed") return new Response("{", { status: 200, headers: { "content-type": "application/json" } });
      if (mode === "timeout") await new Promise((resolve) => setTimeout(resolve, 35_000));
      if (url.pathname === "/v1/models") return Response.json({ object: "list", data: [{ id: "consumer-proof-model", object: "model" }] });
      return Response.json(openAiSuccess(url.pathname));
    },
  };
}
```

`openAiSuccess` must return valid Chat Completions and Responses API shapes with deterministic IDs and a booking-assistant response; never persist request bodies.

- [ ] **Step 4: Add the proof-only Caddy routing**

```caddyfile
https://localhost:8443 {
	tls internal
	encode zstd gzip
	handle /v1/* { reverse_proxy reservation-api:4100 }
	handle /admin* { reverse_proxy reservation-console:4300 }
	handle { reverse_proxy reservation-booking:4400 }
	header {
		-Server
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		X-Frame-Options "DENY"
	}
}
```

- [ ] **Step 5: Add the Compose override**

The exact override must:

- Put `reservation-edge` behind profile `external-edge`.
- Override API CORS and booking public base URL to `https://localhost:${RESERVATION_CONSUMER_EDGE_PORT}`.
- Add `consumer-edge` using the pinned Caddy image, mounting only the proof Caddyfile, and bind `127.0.0.1:${RESERVATION_CONSUMER_EDGE_PORT}:8443`.
- Add `consumer-mailpit` using `axllent/mailpit:v1.30.0`, publish only `127.0.0.1:${RESERVATION_CONSUMER_MAILPIT_PORT}:8025`, and expose SMTP only to `reservation-backend`.
- Add `consumer-ai` using the locally built tools image and the copied provider file, with no published port.
- Keep both substitutes on the private backend network and add no Docker socket.

- [ ] **Step 6: Validate rendered Compose and provider behavior**

Run: `pnpm run test:consumer-docker:harness && pnpm run test:consumer-docker:preflight`

Expected: PASS; static contract confirms loopback-only publication and provider tests confirm all five modes.

- [ ] **Step 7: Commit**

```bash
git add tests/consumer-docker-e2e/compose.override.yml tests/consumer-docker-e2e/Caddyfile tests/consumer-docker-e2e/providers tests/consumer-docker-e2e/contract.test.mjs
git commit -m "test(consumer): add local channel providers"
```

### Task 5: Add Lifecycle Orchestration, Evidence, Redaction, and Cleanup

**Files:**
- Create: `tests/consumer-docker-e2e/support/evidence.mjs`
- Create: `tests/consumer-docker-e2e/support/evidence.test.mjs`
- Create: `tests/consumer-docker-e2e/support/cleanup.mjs`
- Create: `tests/consumer-docker-e2e/support/cleanup.test.mjs`
- Modify: `tests/consumer-docker-e2e/scripts/run.mjs`

**Interfaces:**
- Produces: `createEvidenceRecorder(context)`, `sanitizeConsumerEvidence(value)`, `cleanupConsumerProjects(context, runner)`, and phase names `preflight`, `artifacts`, `materialize`, `startup`, `installation`, `journeys`, `restart`, `backup`, `restore`, `developer`, `evidence`, `cleanup`.

- [ ] **Step 1: Write failing redaction, phase-order, and cleanup tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createEvidenceRecorder, sanitizeConsumerEvidence } from "./evidence.mjs";

test("evidence removes capabilities, credentials, PII, prompts, and QR payloads", () => {
  const value = sanitizeConsumerEvidence({ output: "Bearer live-token password=hunter2 jane@example.test QR payload: abc prompt=private" });
  const serialized = JSON.stringify(value);
  for (const forbidden of ["live-token", "hunter2", "jane@example.test", "abc", "private"]) assert.equal(serialized.includes(forbidden), false);
});

test("recorder rejects out-of-order phases", () => {
  const recorder = createEvidenceRecorder({ runId: "abcdef123456" });
  recorder.complete("preflight", { ok: true });
  assert.throws(() => recorder.complete("startup", { ok: true }), /phase order/u);
});
```

```js
import assert from "node:assert/strict";
import test from "node:test";
import { cleanupConsumerProjects } from "./cleanup.mjs";

test("cleanup targets only the exact generated primary and restore projects", async () => {
  const calls = [];
  await cleanupConsumerProjects({
    projectName: "reservation-consumer-proof-abcdef123456",
    restoreProjectName: "reservation-consumer-proof-abcdef123456-restore",
    installationDirectory: "/tmp/proof/installation",
    restoreDirectory: "/tmp/proof/restore",
    keep: false,
  }, async (input) => calls.push(input));
  assert.deepEqual(calls, [
    { project: "reservation-consumer-proof-abcdef123456-restore", directory: "/tmp/proof/restore" },
    { project: "reservation-consumer-proof-abcdef123456", directory: "/tmp/proof/installation" },
  ]);
});

test("cleanup rejects an unsafe project name", async () => {
  await assert.rejects(cleanupConsumerProjects({ projectName: "reservation-platform", restoreProjectName: "bad", keep: false }, async () => undefined), /unsafe project/u);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/consumer-docker-e2e/support/evidence.test.mjs tests/consumer-docker-e2e/support/cleanup.test.mjs`

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement evidence schema and sanitization**

Use an allowlisted result shape:

```js
export const evidencePhases = Object.freeze(["preflight", "artifacts", "materialize", "startup", "installation", "journeys", "restart", "backup", "restore", "developer", "evidence", "cleanup"]);
export const evidenceKeys = new Set(["schema_version", "run_id", "commit", "images", "migration", "started_at", "completed_at", "phases", "counts", "checksums", "verdict"]);
```

`sanitizeConsumerEvidence` must recursively keep only documented keys, replace bearer/cookie/password/token/key/QR/prompt/message patterns and email-shaped values with `[REDACTED]`, cap strings at 2,048 characters, cap arrays at 100 items, and reject non-JSON values. `writeEvidence` must atomically create `summary.json` and `summary.md` with mode `0600`.

- [ ] **Step 4: Implement exact cleanup and signal handling**

Validate project names with:

```js
const primaryProject = /^reservation-consumer-proof-[a-f0-9]{12}$/u;
const restoreProject = /^reservation-consumer-proof-[a-f0-9]{12}-restore$/u;
```

Cleanup must pass `{ project, directory }` to its injected runner for restore then primary. The default runner executes `docker compose --project-name <project> --project-directory <directory> -f <directory>/compose.production.yml -f <directory>/compose.override.yml down --volumes --remove-orphans`. When `keep` is true, perform no Docker mutation and return `{ retained: true }`. Register `SIGINT` and `SIGTERM` once and make cleanup idempotent.

- [ ] **Step 5: Complete the runner state machine**

The runner must wrap every phase with `recorder.start(name)` and `recorder.complete(name, boundedResult)`, stop dependent work after a failed phase, collect `docker compose ps --format json` and at most 200 log lines on failure, always write evidence, and always clean unless `--keep`. Secrets must enter child processes through `input` or environment, never argv.

- [ ] **Step 6: Run harness tests**

Run: `pnpm run test:consumer-docker:harness`

Expected: PASS with no live containers started by unit tests.

- [ ] **Step 7: Commit**

```bash
git add tests/consumer-docker-e2e/support tests/consumer-docker-e2e/scripts/run.mjs
git commit -m "test(consumer): orchestrate redacted proof evidence"
```

### Task 6: Exercise Installation and Owner Onboarding Through the UI

**Files:**
- Create: `tests/consumer-docker-e2e/playwright.config.ts`
- Create: `tests/consumer-docker-e2e/support/consumer-context.ts`
- Create: `tests/consumer-docker-e2e/journeys/installation.spec.ts`
- Create: `tests/consumer-docker-e2e/journeys/owner-setup.spec.ts`
- Modify: `tests/consumer-docker-e2e/scripts/run.mjs`

**Interfaces:**
- `consumer-context.ts` reads generated `runtime-state.json` and exports `edgeOrigin`, owner credentials, business slug, and `recordCreated(name, value)`.
- Installation runner retrieves `/run/reservation-config/setup-token` from `reservation-config` through stdin-safe Compose execution and writes it only to protected runtime state.

- [ ] **Step 1: Create the isolated Playwright configuration**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./journeys",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [["list"], ["html", { outputFolder: "../../test-results/consumer-docker/playwright", open: "never" }]],
  use: {
    baseURL: process.env.RESERVATION_CONSUMER_EDGE_ORIGIN,
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "consumer-desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } }],
});
```

- [ ] **Step 2: Write the failing installation journey**

```ts
import { expect, test } from "@playwright/test";
import { consumer } from "../support/consumer-context";

test("a new operator creates the first owner without demo data", async ({ page, request }) => {
  await page.goto(`/admin/setup?token=${consumer.setupToken}`);
  await expect(page.getByRole("heading", { name: "Infrastructure is ready" })).toBeVisible();
  await page.getByLabel("Your name").fill("Consumer Proof Owner");
  await page.getByLabel("Email address").fill(consumer.ownerEmail);
  await page.getByLabel("Password").fill(consumer.ownerPassword);
  await page.getByRole("button", { name: "Create owner account" }).click();
  await page.waitForURL(/\/admin(?:\/onboarding)?$/u);
  await expect(page).not.toHaveURL(/token=/u);
  const demo = await request.get(`${consumer.edgeOrigin}/v1/public/experiences/apex-racing-demo`);
  expect(demo.status()).toBe(404);
});
```

- [ ] **Step 3: Write the owner onboarding journey**

The test must use visible labels to create:

```ts
const business = {
  name: "Northstar Wellness Studio",
  slug: "northstar-wellness",
  location: "Central Studio",
  timezone: "Asia/Kuala_Lumpur",
  service: "Initial Consultation",
  practitioner: "Amina Rahman",
};
```

It follows `/admin/setup/business` through location, services, staff, hours, channels, and review. Use `Business name`, `Public booking slug`, `First location name`, service `Name`, `Duration in minutes`, `Practitioner name`, every day's primary `Opens`/`Closes` controls set to `09:00`/`17:00`, `Minimum notice (minutes)` set to `0`, `Web AI chat`, `WhatsApp`, the confirmation text `I understand this draft will become the customer-facing experience.`, and `Publish and open dashboard`. End by asserting `GET /northstar-wellness` displays the business and service.

After onboarding, open `/admin/studio/resources`, add a second `custom` resource named `Daniel Lee` with capacity `1`, and confirm both practitioners appear. Open `/admin/resources`, start maintenance for `Daniel Lee` with reason `Consumer proof unavailable interval`, confirm the resource is unavailable while `Amina Rahman` retains bookable slots, then end maintenance using `Resource returned to service`. This creates and closes a real unavailable interval through supported owner operations.

- [ ] **Step 4: Run the journey before wiring it into orchestration**

Run: `pnpm exec playwright test --config tests/consumer-docker-e2e/playwright.config.ts tests/consumer-docker-e2e/journeys/installation.spec.ts`

Expected: FAIL because no consumer Docker environment or `runtime-state.json` exists; the failure must not fall back to local demo fixtures.

- [ ] **Step 5: Wire startup, setup-token capture, and the owner Playwright project**

Update `run.mjs` to:

1. Build and materialize artifacts.
2. Run `reservation-config`, database, migrate, bootstrap, rest, API, worker, console, booking, Mailpit, AI, and consumer edge.
3. Wait for `GET https://localhost:<port>/v1/health/ready` with certificate verification disabled only in the host proof client.
4. Read the setup token with `docker compose run --rm --no-deps --entrypoint /bin/cat reservation-config /run/reservation-config/setup-token`, capture stdout in memory, and write protected `runtime-state.json`.
5. Run the installation and owner Playwright specs with the runtime-state path in an environment variable.

- [ ] **Step 6: Run the first live slice**

Run: `pnpm run test:consumer-docker:keep`

Expected: installation and owner onboarding PASS; retained output prints the generated workspace and `https://localhost:4543`, and the public demo slug returns 404.

- [ ] **Step 7: Commit**

```bash
git add tests/consumer-docker-e2e/playwright.config.ts tests/consumer-docker-e2e/support/consumer-context.ts tests/consumer-docker-e2e/journeys/installation.spec.ts tests/consumer-docker-e2e/journeys/owner-setup.spec.ts tests/consumer-docker-e2e/scripts/run.mjs
git commit -m "test(consumer): prove clean owner onboarding"
```

### Task 7: Exercise Staff, Customer, and SMTP Journeys

**Files:**
- Create: `tests/consumer-docker-e2e/support/mailpit.ts`
- Create: `tests/consumer-docker-e2e/journeys/staff-operations.spec.ts`
- Create: `tests/consumer-docker-e2e/journeys/customer-booking.spec.ts`
- Modify: `tests/consumer-docker-e2e/journeys/owner-setup.spec.ts`

**Interfaces:**
- `waitForMailCategory({ recipient, category }): Promise<{ id: string; subject: string; link?: string }>` returns no body content.
- Runtime state gains staff email, invitation link, reservation ID, and opaque management token; evidence stores only hashes or bounded IDs.

- [ ] **Step 1: Implement and test the bounded Mailpit client**

```ts
export async function waitForMailCategory(input: { origin: string; recipient: string; category: "invitation" | "confirmation" | "reschedule" | "cancellation" | "reminder"; timeoutMs?: number }) {
  const deadline = Date.now() + (input.timeoutMs ?? 20_000);
  while (Date.now() < deadline) {
    const response = await fetch(`${input.origin}/api/v1/search?query=${encodeURIComponent(`to:${input.recipient}`)}`);
    if (response.ok) {
      const result = await response.json() as { messages?: Array<{ ID: string; Subject: string }> };
      const message = result.messages?.find((item) => subjectMatches(input.category, item.Subject));
      if (message) return { id: message.ID, subject: message.Subject };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Mail category ${input.category} was not delivered.`);
}
```

Write a unit test with injected `fetch` proving message bodies and addresses are not returned.

- [ ] **Step 2: Extend owner setup to configure SMTP and invite staff**

Use `/admin/settings/email` with host `consumer-mailpit`, port `1025`, transport `None`, from address `appointments@northstar.invalid`, and no authentication. Save, send the test email, then open `/admin/settings/staff`, invite `Consumer Proof Staff` at the generated staff address, and obtain the invitation URL from Mailpit through its message-detail endpoint in memory. Never write the raw invitation URL to evidence.

- [ ] **Step 3: Write the staff journey**

In a fresh browser context, open the invitation link, choose a 12+ character password, accept the invitation, and assert the staff dashboard loads. Create a staff appointment, reschedule it, and cancel it through visible reservation controls. Assert `/admin/settings/email`, `/admin/settings/ai`, and `/admin/studio` redirect or return forbidden state for staff.

- [ ] **Step 4: Write the customer journey**

In a fresh unauthenticated context:

1. Open `/northstar-wellness`.
2. Select `Initial Consultation` and `Amina Rahman`.
3. Select the first enabled date and time.
4. Fill customer name `Customer Proof`, generated email, and quantity `1`.
5. Review and confirm exactly once.
6. Save the management URL in protected runtime state.
7. Open the management URL, reschedule to the next available slot, then cancel.
8. Assert Mailpit categories confirmation, reschedule, and cancellation each appear once.

- [ ] **Step 5: Run staff/customer journeys against the retained environment**

Run: `RESERVATION_CONSUMER_WORKSPACE=<printed-workspace> pnpm exec playwright test --config tests/consumer-docker-e2e/playwright.config.ts tests/consumer-docker-e2e/journeys/staff-operations.spec.ts tests/consumer-docker-e2e/journeys/customer-booking.spec.ts`

Expected: PASS; staff authorization boundaries hold, customer management works without authentication, and Mailpit contains the expected categories.

- [ ] **Step 6: Commit**

```bash
git add tests/consumer-docker-e2e/support/mailpit.ts tests/consumer-docker-e2e/journeys
git commit -m "test(consumer): prove appointment user journeys"
```

### Task 8: Exercise AI Chat, WhatsApp Simulation, and Staff Takeover

**Files:**
- Create: `tests/consumer-docker-e2e/journeys/channels.spec.ts`
- Extend: `tests/consumer-docker-e2e/providers/deterministic-openai.mjs`
- Modify: `tests/consumer-docker-e2e/scripts/run.mjs`

**Interfaces:**
- AI base URL inside Docker: `http://consumer-ai:8080/v1`.
- WhatsApp simulation uses authenticated owner route through the console/API and records only conversation/reservation UUIDs.

- [ ] **Step 1: Write the failing channel journey**

```ts
import { expect, test } from "@playwright/test";
import { consumer, loginOwner } from "../support/consumer-context";

test("AI proposal requires confirmation and WhatsApp takeover suppresses automation", async ({ browser }) => {
  const ownerContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const owner = await ownerContext.newPage();
  await loginOwner(owner);
  await owner.goto("/admin/settings/ai");
  await owner.getByLabel("Enable AI automation").check();
  await owner.getByLabel("Model").fill("consumer-proof-model");
  await owner.getByLabel("Base URL").fill("http://consumer-ai:8080/v1");
  await owner.getByLabel("API key").fill(consumer.aiKey);
  await owner.getByRole("button", { name: "Save AI settings" }).click();
  await owner.getByRole("button", { name: "Test connection" }).click();
  await expect(owner.getByText(/connection.*successful|provider.*ready/iu)).toBeVisible();
  await ownerContext.close();
});
```

Extend this file with public chat proposal/confirmation and owner WhatsApp simulation/takeover assertions.

- [ ] **Step 2: Run the channel journey before provider tool shapes are complete**

Run: `RESERVATION_CONSUMER_WORKSPACE=<printed-workspace> pnpm exec playwright test --config tests/consumer-docker-e2e/playwright.config.ts tests/consumer-docker-e2e/journeys/channels.spec.ts`

Expected: FAIL at provider response parsing or missing booking proposal.

- [ ] **Step 3: Implement deterministic tool-call scenarios**

For fixed messages, return valid tool calls in this order:

```js
const scenarios = Object.freeze({
  services: { tool: "get_services", arguments: {} },
  availability: { tool: "check_availability", arguments: { service_id: "__FROM_PROMPT__", date: "__FROM_PROMPT__" } },
  prepare: { tool: "prepare_booking", arguments: { service_id: "__FROM_PROMPT__", date: "__FROM_PROMPT__", start_time: "__FROM_PROMPT__", customer_name: "Channel Proof", customer_email: "channel-proof@example.invalid", quantity: 1 } },
});
```

Resolve prompt-derived values without writing the prompt to disk or logs. The provider must never execute reservation tools itself.

- [ ] **Step 4: Complete the browser assertions**

The public chat test must prove no reservation exists before confirmation, one reservation exists after explicit confirmation, and repeating confirmation does not duplicate it. The WhatsApp test must inject a generated inbound message ID, verify one unified conversation and one outbound completion, enable manual takeover, inject another unsupported inbound message, and verify no automated fallback is delivered until explicit resume.

- [ ] **Step 5: Exercise provider failure and handoff**

Set provider mode to `provider_error`, submit a public chat message, and assert a safe retry/handoff response with no provider body or API key. Verify the conversation appears for staff takeover and the durable job reaches a terminal or retry state rather than remaining leased.

- [ ] **Step 6: Run the channel journey**

Run: `RESERVATION_CONSUMER_WORKSPACE=<printed-workspace> pnpm exec playwright test --config tests/consumer-docker-e2e/playwright.config.ts tests/consumer-docker-e2e/journeys/channels.spec.ts`

Expected: PASS with explicit confirmation, deduplication, safe failure, and manual takeover behavior.

- [ ] **Step 7: Commit**

```bash
git add tests/consumer-docker-e2e/journeys/channels.spec.ts tests/consumer-docker-e2e/providers/deterministic-openai.mjs tests/consumer-docker-e2e/scripts/run.mjs
git commit -m "test(consumer): prove durable booking channels"
```

### Task 9: Prove Restart Durability, Backup, and Restore

**Files:**
- Create: `tests/consumer-docker-e2e/journeys/recovery.spec.ts`
- Create: `tests/consumer-docker-e2e/support/recovery.mjs`
- Create: `tests/consumer-docker-e2e/support/recovery.test.mjs`
- Modify: `scripts/production/restore.sh`
- Modify: `scripts/production/operations-shell.test.mjs`
- Modify: `tests/consumer-docker-e2e/scripts/run.mjs`

**Interfaces:**
- Produces: `captureBoundedState(client): BoundedState`, `compareRestoredState(before, after)`, `runBackup(context)`, and `runRestore(context, archive)`.
- `BoundedState` contains migration version, installation UUID, business UUID, reservation count, conversation count, completed job count, and SHA-256 hashes of stable opaque identifiers.

- [ ] **Step 1: Write failing bounded comparison tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { compareRestoredState } from "./recovery.mjs";

test("restored state compares identifiers and counts without PII", () => {
  const state = { migration: "000037", installationId: "id", businessId: "business", reservationCount: 3, conversationCount: 2, completedJobCount: 4, identifierChecksum: "a".repeat(64) };
  assert.deepEqual(compareRestoredState(state, { ...state }), { ok: true });
  assert.deepEqual(compareRestoredState(state, { ...state, reservationCount: 2 }), { ok: false, mismatches: ["reservationCount"] });
  assert.equal("customerEmail" in state, false);
});
```

- [ ] **Step 2: Run the test and confirm the recovery module is absent**

Run: `node --test tests/consumer-docker-e2e/support/recovery.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement restart and idempotency checks**

The runner must capture state, run:

```text
docker compose restart reservation-api reservation-worker
```

wait for both health gates, replay the recorded idempotent SDK reservation request, and assert unchanged reservation/notification counts. Then `recovery.spec.ts` logs in again and verifies business, appointment, conversation, integration readiness, and completed delivery state remain visible.

- [ ] **Step 4: Implement supported encrypted backup execution**

Activate only `reservation-operations` with command `/opt/reservation-tools/scripts/production/backup.sh`, bind the generated backup directory, and capture only the resulting archive basename and SHA-256. Assert the archive ends in `.tar.age`, the checksum verifies, and no unencrypted dump remains on the host.

- [ ] **Step 5: Make the supported restore command target an explicit isolated project**

Add optional `RESERVATION_COMPOSE_PROJECT_NAME` and `RESERVATION_COMPOSE_OVERRIDE_FILE` inputs to `scripts/production/restore.sh`. Preserve existing production behavior when both are unset. Validate the project name before any Docker call and construct the Compose function without shell evaluation:

```sh
compose_project=${RESERVATION_COMPOSE_PROJECT_NAME:-}
compose_override=${RESERVATION_COMPOSE_OVERRIDE_FILE:-}
case $compose_project in
  "") ;;
  reservation-consumer-proof-[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]-restore) ;;
  *) fail "Compose project name is invalid" ;;
esac
[ -z "$compose_override" ] || { [ "${compose_override#/}" != "$compose_override" ] && [ -f "$compose_override" ] && [ ! -L "$compose_override" ]; } || fail "Compose override is invalid"

compose() {
  if [ -n "$compose_project" ] && [ -n "$compose_override" ]; then
    docker compose --project-name "$compose_project" --project-directory "$installation_directory" --env-file "$installation_directory/release.env" -f "$installation_directory/compose.production.yml" -f "$compose_override" "$@"
  elif [ -n "$compose_project" ]; then
    docker compose --project-name "$compose_project" --project-directory "$installation_directory" --env-file "$installation_directory/release.env" -f "$installation_directory/compose.production.yml" "$@"
  else
    docker compose --project-directory "$installation_directory" --env-file "$installation_directory/release.env" -f "$installation_directory/compose.production.yml" "$@"
  fi
}
```

Extend `operations-shell.test.mjs` to assert unsafe names and relative/symlink override paths fail before Docker, default production argv stays unchanged, and the proof inputs add exactly one `--project-name` and one override `-f`.

- [ ] **Step 6: Implement clean restore project materialization**

Create the restore directory with the same artifacts and override, but a distinct Compose project and empty volumes. Start configuration/database/migration prerequisites, invoke the supported restore command with `RESERVATION_COMPOSE_PROJECT_NAME=<restoreProjectName>` and `RESERVATION_COMPOSE_OVERRIDE_FILE=/opt/reservation-installation/compose.override.yml`, supply the installation ID through protected environment/stdin rather than logs, wait for restored readiness, and capture bounded restored state. Verify only `reservation-operations` had the Docker socket during this stage.

- [ ] **Step 7: Run focused recovery tests and the retained live slice**

Run: `node --test tests/consumer-docker-e2e/support/recovery.test.mjs scripts/production/operations-shell.test.mjs`

Run: `RESERVATION_CONSUMER_WORKSPACE=<printed-workspace> pnpm exec playwright test --config tests/consumer-docker-e2e/playwright.config.ts tests/consumer-docker-e2e/journeys/recovery.spec.ts`

Expected: both PASS; restored state matches migration `000037`, installation/business identifiers, and bounded counts.

- [ ] **Step 8: Commit**

```bash
git add tests/consumer-docker-e2e/support/recovery.mjs tests/consumer-docker-e2e/support/recovery.test.mjs tests/consumer-docker-e2e/journeys/recovery.spec.ts tests/consumer-docker-e2e/scripts/run.mjs scripts/production/restore.sh scripts/production/operations-shell.test.mjs
git commit -m "test(consumer): prove restart and restore durability"
```

### Task 10: Prove Independent Packed-SDK Consumption

**Files:**
- Create: `tests/consumer-docker-e2e/developer-app/src/index.ts`
- Create: `tests/consumer-docker-e2e/developer-app/verify.mjs`
- Create: `tests/consumer-docker-e2e/developer-app/verify.test.mjs`
- Modify: `tests/consumer-docker-e2e/scripts/run.mjs`

**Interfaces:**
- Developer app reads only `RESERVATION_CONSUMER_EDGE_ORIGIN`, `RESERVATION_CONSUMER_PUBLIC_SLUG`, and `NODE_TLS_REJECT_UNAUTHORIZED=0` scoped to the test process.
- Developer result: `{ serviceCount, slotCount, reservationId, replayed, platformErrorCode }`.

- [ ] **Step 1: Write the failing package-boundary verifier test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { verifyDeveloperWorkspace } from "./verify.mjs";

test("developer workspace rejects monorepo and backend dependencies", async () => {
  const findings = verifyDeveloperWorkspace({
    packageJson: { dependencies: { "@reservation-platform/sdk": "file:artifacts/sdk.tgz" } },
    lockfile: "lockfileVersion: '9.0'",
    source: "import { createReservationPlatformClient } from '@reservation-platform/sdk';",
    bundle: "createReservationPlatformClient",
  });
  assert.deepEqual(findings, []);
  assert.ok(verifyDeveloperWorkspace({ packageJson: { dependencies: { bad: "workspace:*" } }, lockfile: "", source: "", bundle: "" }).length > 0);
});
```

- [ ] **Step 2: Run the verifier test and confirm missing exports**

Run: `node --test tests/consumer-docker-e2e/developer-app/verify.test.mjs`

Expected: FAIL because `verify.mjs` does not exist.

- [ ] **Step 3: Implement the independent SDK application**

```ts
import { createIdempotencyKey, createReservationPlatformClient, isPlatformError } from "@reservation-platform/sdk";

const origin = required("RESERVATION_CONSUMER_EDGE_ORIGIN");
const slug = required("RESERVATION_CONSUMER_PUBLIC_SLUG");
const client = createReservationPlatformClient({ baseUrl: origin, timeoutMs: 10_000, retry: { attempts: 2 } });
const experience = await client.getPublicExperience(slug);
const services = await client.listPublicExperienceServices(slug);
const service = services.services.find((item) => item.is_active !== false);
if (!service) throw new Error("Consumer SDK proof found no published service.");
const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const availability = await client.listPublicExperienceAvailability(slug, { service_id: service.service_id, date });
const slot = availability.slots.find((item) => item.is_available);
if (!slot) throw new Error("Consumer SDK proof found no available slot.");
const idempotencyKey = createIdempotencyKey("consumer-proof");
const input = { service_id: service.service_id, start_at: slot.start_at, end_at: slot.end_at, quantity: 1, customer: { name: "SDK Consumer", email: "sdk-consumer@example.invalid" } };
const first = await client.createPublicExperienceReservation(slug, input, { idempotencyKey });
const replay = await client.createPublicExperienceReservation(slug, input, { idempotencyKey });
let platformErrorCode = "";
try { await client.getPublicExperience("missing-consumer-business"); } catch (error) { if (isPlatformError(error)) platformErrorCode = error.body.code; else throw error; }
process.stdout.write(JSON.stringify({ experience: experience.profile.name, serviceCount: services.services.length, slotCount: availability.slots.length, reservationId: first.reservation_id, replayed: replay.reservation_id === first.reservation_id, platformErrorCode }));

function required(name: string) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required.`); return value; }
```

- [ ] **Step 4: Implement materialized install and boundary verification**

`verify.mjs` must:

1. Replace tarball markers in `package.template.json` with relative copied `.tgz` paths.
2. Run `pnpm install --lockfile-only --ignore-scripts`.
3. Reject `workspace:`, `link:`, `portal:`, repository absolute paths, and backend package names in package metadata and lockfile.
4. Run `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm run typecheck`, and `pnpm run start`.
5. Scan source and generated output for Supabase service roles, installation keys, session tokens, provider credentials, and imports from database/backend packages.
6. Validate the JSON result and return only bounded counts, UUID, replay boolean, and error code.

- [ ] **Step 5: Run the developer proof**

Run: `RESERVATION_CONSUMER_WORKSPACE=<printed-workspace> pnpm run test:consumer-docker:developer`

Expected: PASS; packed artifacts install outside the monorepo, type-check, create/replay one reservation, and map a public not-found error.

- [ ] **Step 6: Commit**

```bash
git add tests/consumer-docker-e2e/developer-app tests/consumer-docker-e2e/scripts/run.mjs
git commit -m "test(consumer): prove packed SDK integration"
```

### Task 11: Integrate CI Contracts, Documentation, and the Complete Live Proof

**Files:**
- Create: `tests/consumer-docker-e2e/README.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `docs/release-evidence/0.2.0/release-checklist.md`
- Test: all files under `tests/consumer-docker-e2e/`

**Interfaces:**
- CI job `consumer-docker` runs only after `verify` and uploads sanitized evidence on success or failure.
- `ci:verify` includes `test:consumer-docker:harness`, not the live Docker proof.

- [ ] **Step 1: Add static harness tests to the aggregate gate**

Change `ci:verify` by appending `&& pnpm run test:consumer-docker:harness`. Do not add `test:consumer-docker` to this fast job.

- [ ] **Step 2: Add the dedicated CI job**

```yaml
consumer-docker:
  needs: verify
  runs-on: ubuntu-latest
  timeout-minutes: 60
  steps:
    - name: Check out repository
      uses: actions/checkout@v4
    - name: Set up pnpm
      uses: pnpm/action-setup@v4
      with:
        version: 10.33.2
    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: pnpm
        cache-dependency-path: pnpm-lock.yaml
    - name: Install dependencies
      run: pnpm install --frozen-lockfile
    - name: Install Chromium
      run: pnpm run browser:install:ci
    - name: Run clean-room Docker consumer proof
      run: pnpm run test:consumer-docker
    - name: Upload sanitized consumer evidence
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: consumer-docker-evidence
        path: test-results/consumer-docker/
        if-no-files-found: error
```

- [ ] **Step 3: Ignore generated artifacts and write operator documentation**

Add:

```gitignore
/test-results/consumer-docker/
```

The README must document Docker/Compose/Node/pnpm prerequisites, estimated disk/time, commands, phase order, `--keep` behavior, evidence location, cleanup guarantee, Mailpit/AI substitutes, and the explicit statement that simulation does not satisfy live Baileys or external release acceptance.

- [ ] **Step 4: Record the local proof without overstating release acceptance**

Add a checked release-checklist line:

```markdown
- [x] Isolated local Docker consumer proof covers clean setup, owner/staff/customer journeys, deterministic channel substitutes, restart, encrypted restore, and packed-SDK consumption.
```

Keep every external observed-evidence item unchecked.

- [ ] **Step 5: Run the complete live proof from a clean state**

Run: `pnpm run test:consumer-docker`

Expected: PASS with a generated redacted JSON/Markdown summary, all journey phases complete, primary and restore projects removed, and no unrelated container or volume changed.

- [ ] **Step 6: Run all regression gates**

Run each command independently with plain `pnpm`:

```bash
pnpm --dir packages/whatsapp run test
pnpm --dir packages/database run test
pnpm --dir packages/reservations-supabase run test
pnpm --dir apps/api run test
pnpm run ci:verify
pnpm run production:verify
pnpm run stack:up
pnpm run stack:verify:live
pnpm run test:browser
pnpm run stack:down
```

Render production Compose separately with the five safe local image tags and required metadata:

```bash
RESERVATION_RELEASE=0.2.0 RESERVATION_DOMAIN=consumer.reservation.test RESERVATION_API_IMAGE=reservation-platform-api:consumer-proof RESERVATION_WORKER_IMAGE=reservation-platform-worker:consumer-proof RESERVATION_CONSOLE_IMAGE=reservation-platform-console:consumer-proof RESERVATION_BOOKING_IMAGE=reservation-platform-booking:consumer-proof RESERVATION_TOOLS_IMAGE=reservation-platform-tools:consumer-proof pnpm run production:compose:check
```

Expected: all four affected suites pass; aggregate CI, browser matrix, production topology, rendered Compose, and live local stack pass.

- [ ] **Step 7: Verify repository hygiene**

Run:

```bash
rg -n 'corepack pnpm' --glob 'package.json' .
git diff --check
git status --short
```

Expected: the package scan has no matches; diff check has no output; status contains only intended tracked changes plus pre-existing `.superpowers/` and `tmp/`.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/ci.yml .gitignore package.json tests/consumer-docker-e2e/README.md docs/release-evidence/0.2.0/release-checklist.md
git commit -m "ci(consumer): run clean-room Docker proof"
```

## Final Acceptance Record

After Task 11 passes, record in the implementation handoff:

- Exact commit SHA and local image tags.
- All eleven task commits.
- Consumer proof phase results and sanitized evidence paths.
- Test totals for WhatsApp, database, reservations-supabase, API, browser, and harness suites.
- Confirmation that primary and restore Compose resources were removed.
- Confirmation that `.superpowers/` and `tmp/` were not staged.
- Remaining external-only items: published digest-pinned images and signatures, supported Ubuntu host, public DNS/TLS, live SMTP/AI/Baileys, and independent eight-hour operation.
