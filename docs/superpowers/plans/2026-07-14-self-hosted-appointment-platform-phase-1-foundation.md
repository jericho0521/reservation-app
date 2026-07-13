# Phase 1: Deployment and Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a green baseline and a production Docker topology that reaches a one-time HTTPS setup page on a clean Ubuntu VPS.

**Architecture:** Keep the development `docker-compose.yml` intact and add a separate production Compose file using pinned registry images, Caddy, private networks, generated secret files, PostgreSQL, PostgREST, API, console, booking, and a minimal worker. Harden the Node runtime before exposing it through Caddy.

**Tech Stack:** Node.js 20, TypeScript 5, pnpm 10.33.2, Docker Compose, PostgreSQL 16, PostgREST, Caddy, GitHub Actions, and Node test runner.

## Global Constraints

- Follow the constraints and locked interfaces in `2026-07-14-self-hosted-appointment-platform-master.md`.
- Do not stage the existing Docker-first development changes until they have been independently reviewed and verified.
- Production Compose must not build source on the VPS and must never run a demo seed.
- No production secret value may be printed by a script or container entrypoint.

---

### Task 1: Reconcile the Existing Worktree and Prove the Phase 0 Baseline

**Files:**
- Verify: `packages/whatsapp/src/module.test.ts`
- Verify: `packages/whatsapp/src/baileys-adapter.ts`
- Verify: `apps/api/src/runtime.ts`
- Verify: `packages/database/src/supabase-migrations.test.ts`
- Verify: `packages/database/migrations/supabase/migration-index.json`
- Verify: root and package `package.json` files
- Create: `docs/release-evidence/phase-1-baseline.md`

**Interfaces:**
- Consumes: current Phase 0 fixes and the existing local Docker-stack worktree.
- Produces: a reviewed, green starting commit sequence and a recorded baseline.

- [ ] **Step 1: Inspect the exact uncommitted scope before changing anything**

Run:

```bash
git status --short
git diff --name-only
git ls-files --others --exclude-standard
```

Expected: the operator can separate Phase 0, Docker development stack, handbook, and unrelated files. Do not use `git add .`.

- [ ] **Step 2: Verify that no script invokes Corepack**

Run:

```bash
rg -n 'corepack pnpm' --glob 'package.json' .
```

Expected: exit `1` with no matches.

- [ ] **Step 3: Run the four required Phase 0 suites individually**

Run each command from its directory:

```bash
cd packages/whatsapp && pnpm run test
cd packages/database && pnpm run test
cd packages/reservations-supabase && pnpm run test
cd apps/api && pnpm run test
```

Expected: every suite exits `0`. If a suite fails, fix only the confirmed Phase 0 behaviour and rerun that suite before continuing.

- [ ] **Step 4: Run the existing Docker-development verification before committing overlapping files**

Run:

```bash
pnpm run local-stack:test
pnpm run stack:verify
pnpm run deploy:verify
```

Expected: all static checks exit `0`. Live Compose checks may be recorded separately if Docker is unavailable.

- [ ] **Step 5: Record the baseline using real command results**

Create `docs/release-evidence/phase-1-baseline.md` containing the branch and commit, individual results for the four Phase 0 suites, the zero-match Corepack check, migration-bundle result, local-stack static result, skipped live checks with reasons, and the exact ISO-8601 timestamp returned by `date -Iseconds`. Do not copy a planned result into the evidence file; record only observed output.

- [ ] **Step 6: Split and commit only verified pre-existing work**

Use separate commits for confirmed Phase 0 changes, Docker development stack, and handbook corrections. The intended commit subjects are:

```text
fix: close phase zero reliability gaps
feat: add docker-first development stack
docs: align handbook with docker-first workflow
test: record phase one baseline
```

Expected: `git diff --cached --name-status` contains only the files for the commit being created.

### Task 2: Make CI Scripts Self-Consistent

**Files:**
- Create: `scripts/verify-workflow-scripts.mjs`
- Create: `scripts/verify-workflow-scripts.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: root `package.json` scripts and GitHub workflow `pnpm run` commands.
- Produces: `pnpm run ci:verify` and a checker that rejects references to missing scripts or `corepack pnpm`.

- [ ] **Step 1: Write the failing workflow-script test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { verifyWorkflowScripts } from "./verify-workflow-scripts.mjs";

test("workflow verification rejects missing pnpm scripts", () => {
  const findings = verifyWorkflowScripts({
    packageJson: { scripts: { test: "node --test" } },
    workflows: [{ path: ".github/workflows/ci.yml", text: "run: pnpm run missing" }],
  });
  assert.deepEqual(findings, [".github/workflows/ci.yml references missing script: missing"]);
});

test("workflow verification rejects corepack pnpm", () => {
  const findings = verifyWorkflowScripts({
    packageJson: { scripts: { test: "corepack pnpm test" } },
    workflows: [],
  });
  assert.deepEqual(findings, ["package.json script test invokes corepack pnpm"]);
});
```

- [ ] **Step 2: Run the test and observe the missing module failure**

Run: `node --test scripts/verify-workflow-scripts.test.mjs`

Expected: FAIL because `verify-workflow-scripts.mjs` does not exist.

- [ ] **Step 3: Implement the checker**

```js
export function verifyWorkflowScripts({ packageJson, workflows }) {
  const scripts = packageJson.scripts ?? {};
  const findings = [];
  for (const [name, command] of Object.entries(scripts)) {
    if (/\bcorepack\s+pnpm\b/u.test(String(command))) {
      findings.push(`package.json script ${name} invokes corepack pnpm`);
    }
  }
  for (const workflow of workflows) {
    for (const match of workflow.text.matchAll(/pnpm\s+run\s+([\w:-]+)/gu)) {
      if (!(match[1] in scripts)) findings.push(`${workflow.path} references missing script: ${match[1]}`);
    }
  }
  return findings;
}
```

Add a CLI entry that loads `package.json`, `.github/workflows/ci.yml`, and `.github/workflows/deploy.yml`, prints findings, and exits `1` when findings exist.

- [ ] **Step 4: Replace placeholder workflow commands with one real root gate**

Add root scripts:

```json
{
  "scripts": {
    "ci:verify-scripts": "node scripts/verify-workflow-scripts.mjs",
    "sdk:release-gate": "pnpm run sdk:release-artifacts:check && pnpm run packages:verify-boundaries && pnpm run sdk:registry-install-proof",
    "ci:verify": "pnpm run ci:verify-scripts && pnpm test && pnpm run sdk:release-gate && pnpm build && pnpm run deploy:verify"
  }
}
```

Change both workflows to run `pnpm run ci:verify`. Remove the nonexistent browser-install and lint steps; do not label a boundary/build command as linting.

- [ ] **Step 5: Run the checker and root gate**

Run:

```bash
node --test scripts/verify-workflow-scripts.test.mjs
pnpm run ci:verify-scripts
pnpm run ci:verify
```

Expected: every command exits `0`.

- [ ] **Step 6: Commit**

```bash
git add package.json .github/workflows/ci.yml .github/workflows/deploy.yml scripts/verify-workflow-scripts.mjs scripts/verify-workflow-scripts.test.mjs
git commit -m "ci: make repository verification executable"
```

### Task 3: Harden the API HTTP Runtime

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/server.test.ts`
- Modify: `apps/api/src/http.ts`
- Modify: `apps/api/src/routes.ts`
- Modify: `apps/api/src/routes.test.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/runtime.test.ts`
- Modify: `packages/contract-types/src/schemas.ts`
- Modify: `packages/contract-types/src/schemas.test.ts`
- Regenerate: `packages/contract-types/contracts/json-schema/platform-error-code.schema.json`
- Regenerate: `packages/contract-types/contracts/openapi.json`

**Interfaces:**
- Consumes: `StandaloneApiHandler`.
- Produces: `StandaloneNodeServerOptions` with `maxBodyBytes`, `requestTimeoutMs`, `headersTimeoutMs`, and `logger`; `closeStandaloneNodeServer(server)`.

- [ ] **Step 1: Add failing tests for body limits and correlation IDs**

```ts
test("rejects a JSON body above the configured byte limit", async () => {
  const server = createStandaloneNodeServer(async () => jsonResponse(200, { ok: true }), {
    maxBodyBytes: 8,
  });
  const response = await request(server, { method: "POST", body: '{"value":"too-large"}' });
  assert.equal(response.status, 413);
  assert.equal(response.body.error.code, "payload_too_large");
});

test("returns and logs one correlation id", async () => {
  const entries: StructuredLogEntry[] = [];
  const server = createStandaloneNodeServer(async () => jsonResponse(204, undefined), {
    logger: { write: (entry) => entries.push(entry) },
  });
  const response = await request(server, { headers: { "x-correlation-id": "request-123" } });
  assert.equal(response.headers["x-correlation-id"], "request-123");
  assert.equal(entries.at(-1)?.correlationId, "request-123");
});
```

- [ ] **Step 2: Run the focused tests**

Run: `pnpm --dir apps/api exec node --import tsx --test src/server.test.ts`

Expected: FAIL because the new options and error code are absent.

- [ ] **Step 3: Implement bounded reads and structured request completion**

Extend the options with:

```ts
export interface StructuredLogEntry {
  level: "info" | "warn" | "error";
  event: string;
  correlationId: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
}

export interface StandaloneNodeServerOptions {
  cors?: StandaloneCorsOptions;
  maxBodyBytes?: number;
  requestTimeoutMs?: number;
  headersTimeoutMs?: number;
  logger?: { write(entry: StructuredLogEntry): void };
}
```

Read chunks incrementally, destroy the read when the byte count exceeds `maxBodyBytes`, and return `platformError(413, "payload_too_large", "Request body is too large.")`. Generate or validate a correlation ID and return it in every response. Configure `server.requestTimeout`, `server.headersTimeout`, and `server.keepAliveTimeout` before returning the server.

Add `payload_too_large` to `platformErrorCodeSchema`, regenerate contract artifacts with `pnpm --dir packages/contract-types run contracts:generate`, and assert the generated JSON schema contains the new enum value.

- [ ] **Step 4: Add graceful direct-run shutdown**

Export:

```ts
export async function closeStandaloneNodeServer(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections();
  });
}
```

Register `SIGTERM` and `SIGINT` only inside `isDirectRun()`, stop accepting requests, close idle connections, and exit non-zero on a timed-out close.

Add `GET /v1/health/live` as a shallow process response and `GET /v1/health/ready` backed by an injected `readinessCheck(): Promise<{ database: boolean; migrations: boolean }>` dependency. The database runtime checks a service-role query and the indexed migration ledger. Return `503` with safe component names when either check fails. Phase 5 extends this contract with worker/provider/backup state without changing these routes.

- [ ] **Step 5: Verify the API**

Run:

```bash
cd apps/api && pnpm run test
cd apps/api && pnpm run build
cd packages/contract-types && pnpm run test
```

Expected: both commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/server.test.ts apps/api/src/http.ts apps/api/src/routes.ts apps/api/src/routes.test.ts apps/api/src/runtime.ts apps/api/src/runtime.test.ts packages/contract-types/src packages/contract-types/contracts
git commit -m "feat(api): harden the production http runtime"
```

### Task 4: Add the Minimal Durable Worker Application

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/runtime.ts`
- Create: `apps/worker/src/runtime.test.ts`
- Create: `apps/worker/src/server.ts`
- Modify: `pnpm-workspace.yaml` only if `apps/*` is not already included
- Modify: `package.json`

**Interfaces:**
- Consumes: no jobs yet; Phase 3 injects `PlatformJobRepository` and handlers.
- Produces: `runWorkerLoop(options)` with abort-aware polling and `WorkerRuntime` lifecycle.

- [ ] **Step 1: Write the failing abort test**

```ts
test("worker loop stops after abort without another poll", async () => {
  const controller = new AbortController();
  let polls = 0;
  const run = runWorkerLoop({
    signal: controller.signal,
    pollIntervalMs: 1,
    poll: async () => { polls += 1; controller.abort(); },
  });
  await run;
  assert.equal(polls, 1);
});
```

- [ ] **Step 2: Run the new package test**

Run: `pnpm --dir apps/worker run test`

Expected: FAIL because the package and runtime do not exist.

- [ ] **Step 3: Implement the loop**

```ts
export interface WorkerLoopOptions {
  signal: AbortSignal;
  pollIntervalMs: number;
  poll(): Promise<void>;
}

export async function runWorkerLoop(options: WorkerLoopOptions): Promise<void> {
  while (!options.signal.aborted) {
    await options.poll();
    if (options.signal.aborted) break;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, options.pollIntervalMs);
      options.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}
```

`server.ts` creates one `AbortController`, registers `SIGTERM`/`SIGINT`, and starts an inert poller until Phase 3 composes job handlers. It logs only lifecycle event names.

- [ ] **Step 4: Add root scripts**

```json
{
  "scripts": {
    "worker:build": "pnpm --filter @reservation-platform/worker run build",
    "worker:test": "pnpm --filter @reservation-platform/worker run test"
  }
}
```

Add worker build/test to the root build and package-test chains.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --dir apps/worker run test && pnpm --dir apps/worker run build`

Expected: exit `0`.

```bash
git add apps/worker package.json pnpm-workspace.yaml
git commit -m "feat(worker): add abort-safe worker runtime"
```

### Task 5: Generate Production Infrastructure Secrets Without Manual Environment Editing

**Files:**
- Create: `scripts/production/configure.mjs`
- Create: `scripts/production/configure.test.mjs`
- Create: `docker/production/run-with-secrets.sh`
- Create: `Dockerfile.production-tools`
- Modify: `.dockerignore`

**Interfaces:**
- Consumes: `RESERVATION_PRODUCTION_CONFIG_DIR` supplied only inside the tools container.
- Produces: root-readable secret files and a non-secret `release.env` containing domain and pinned image references.

- [ ] **Step 1: Write failing tests for idempotent secret generation and redaction**

```js
test("configure creates secrets once and never prints them", async () => {
  const first = await configureProduction({ directory, domain: "book.example.com", release: "0.2.0", randomBytes });
  const second = await configureProduction({ directory, domain: "book.example.com", release: "0.2.0", randomBytes });
  assert.deepEqual(second.secretDigests, first.secretDigests);
  assert.equal(first.stdout.includes("database-password"), false);
  assert.equal(first.stdout.includes(first.generated.databasePassword), false);
});
```

- [ ] **Step 2: Run the test**

Run: `node --test scripts/production/configure.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement explicit generated files**

Generate these files with mode `0600` and atomic rename:

```text
database-password
postgrest-jwt-secret
postgrest-anon-token
postgrest-service-token
browser-session-secret
internal-service-key
installation-master-key
whatsapp-session-key
backup-recovery-key
setup-token
```

Use `randomBytes(32)` for every root secret, derive signed PostgREST tokens with separate `anon` and `service_role` claims, and write only presence/digest metadata to stdout. The backup recovery key is excluded from backup archives and mounted only into backup/restore tooling; onboarding requires the owner to export and verify a recovery copy. Reject a domain that is not a normalized DNS name and a release that is not an exact immutable tag.

- [ ] **Step 4: Implement the entrypoint contract**

`run-with-secrets.sh` accepts an allowlist of file-to-variable mappings, reads only mounted files, exports them to the child process, and executes the provided command. It must not run `set -x` or echo values.

- [ ] **Step 5: Verify and commit**

Run:

```bash
node --test scripts/production/configure.test.mjs
docker build -f Dockerfile.production-tools -t reservation-platform-tools:test .
```

Expected: tests and image build pass.

```bash
git add scripts/production/configure.mjs scripts/production/configure.test.mjs docker/production/run-with-secrets.sh Dockerfile.production-tools .dockerignore
git commit -m "feat(deploy): generate protected production configuration"
```

### Task 6: Add Production Compose, Caddy, and Pinned Images

**Files:**
- Create: `compose.production.yml`
- Create: `docker/production/Caddyfile`
- Create: `docker/production/postgrest.conf`
- Create: `scripts/verify-production-deployment.mjs`
- Create: `scripts/verify-production-deployment.test.mjs`
- Modify: `Dockerfile`
- Modify: `Dockerfile.web`
- Modify: `package.json`
- Modify: `apps/console/next.config.ts`

**Interfaces:**
- Consumes: generated files under `/run/reservation-secrets` and immutable `RESERVATION_RELEASE` image references.
- Produces: Caddy routes `/v1/*` to API, `/admin*` to console, and all remaining traffic to booking.

- [ ] **Step 1: Write a failing static topology test**

```js
test("production topology exposes only Caddy and contains no seed service", async () => {
  const compose = await readFile("compose.production.yml", "utf8");
  assert.match(compose, /reservation-edge:[\s\S]*80:80[\s\S]*443:443/u);
  assert.doesNotMatch(compose, /reservation-seed:/u);
  assert.doesNotMatch(compose, /build:/u);
  assert.doesNotMatch(compose, /ports:[\s\S]*5432/u);
});
```

- [ ] **Step 2: Run the test**

Run: `node --test scripts/verify-production-deployment.test.mjs`

Expected: FAIL because the production topology does not exist.

- [ ] **Step 3: Define the production services**

`compose.production.yml` must contain:

```text
reservation-config      one-shot protected configuration
reservation-db          postgres:16-alpine with persistent volume
reservation-migrate     one-shot indexed migration runner
reservation-rest        pinned PostgREST image
reservation-api         pinned API image
reservation-worker      pinned worker image
reservation-console     pinned console image
reservation-booking     pinned booking image
reservation-edge        pinned Caddy image, only published service
```

Use `condition: service_healthy` or `service_completed_successfully` where supported. Mount the configuration volume read-only everywhere except `reservation-config`. Do not include `reservation-seed`, simulation defaults, host database ports, or source builds.

- [ ] **Step 4: Add path routing and security headers**

Use this Caddy structure:

```caddy
{$RESERVATION_DOMAIN} {
  encode zstd gzip
  handle /v1/* { reverse_proxy reservation-api:4100 }
  handle /admin* { reverse_proxy reservation-console:4300 }
  handle { reverse_proxy reservation-booking:4400 }
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}
```

- [ ] **Step 5: Add worker and standalone Next image targets**

Add a worker runtime target that copies only production dependencies and `apps/worker/dist`. Ensure console and booking use Next standalone output and run as non-root users.

Set the console Next configuration to `output: "standalone"` and `basePath: "/admin"` so Caddy can preserve `/admin` paths. Phase 2 adds authentication without changing the deployed URL.

- [ ] **Step 6: Add root verification scripts**

```json
{
  "scripts": {
    "production:verify": "node scripts/verify-production-deployment.mjs",
    "production:config:test": "node --test scripts/production/configure.test.mjs",
    "production:compose:check": "docker compose -f compose.production.yml config --quiet"
  }
}
```

- [ ] **Step 7: Verify and commit**

Run:

```bash
node --test scripts/verify-production-deployment.test.mjs
pnpm run production:verify
docker compose -f compose.production.yml config --quiet
docker build --target runtime -t reservation-platform-api:test .
docker build --target worker-runtime -t reservation-platform-worker:test .
docker build -f Dockerfile.web --target console-runtime -t reservation-platform-console:test .
docker build -f Dockerfile.web --target booking-runtime -t reservation-platform-booking:test .
```

Expected: all checks and builds pass.

```bash
git add compose.production.yml docker/production Dockerfile Dockerfile.web apps/console/next.config.ts package.json scripts/verify-production-deployment.mjs scripts/verify-production-deployment.test.mjs
git commit -m "feat(deploy): add production compose topology"
```

### Task 7: Add the Supported Installer and Phase Gate

**Files:**
- Create: `scripts/production/install.sh`
- Create: `scripts/production/preflight.sh`
- Create: `scripts/production/preflight.test.mjs`
- Create: `scripts/production/smoke.mjs`
- Create: `apps/console/app/setup/page.tsx`
- Create: `apps/console/lib/setup-landing.test.ts`
- Create: `docs/operations/production-install.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: release tag, domain, Docker, DNS, and `compose.production.yml`.
- Produces: `/opt/reservation-platform`, generated configuration, running services, and a one-time setup URL.

- [ ] **Step 1: Write preflight tests**

Cover exact failures for unsupported architecture, less than 2 GiB memory, less than 10 GiB free disk, missing Docker Compose v2, occupied ports 80/443, invalid domain, and DNS not resolving to the host. Redact the setup token in test diagnostics.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test scripts/production/preflight.test.mjs`

Expected: FAIL until `preflight.sh` exposes deterministic probe functions through command flags.

- [ ] **Step 3: Implement the install sequence**

`install.sh` must execute this fixed order:

```text
collect release and domain -> preflight -> create /opt/reservation-platform
-> copy/download pinned release assets -> run configuration container
-> docker compose pull -> start database -> run migrations
-> start private services -> start Caddy -> wait for readiness
-> print https://<domain>/admin/setup?token=<single-use-token>
```

Prompt for the domain and release when not supplied as flags. Persist non-secret answers in `/opt/reservation-platform/release.env`; never ask the operator to edit it.

- [ ] **Step 4: Implement the smoke probe**

`smoke.mjs` must require:

```text
GET /v1/health/live       -> 200
GET /v1/health/ready      -> 200
GET /admin/setup          -> 200 before setup completion
GET /                     -> public unpublished/setup-safe response
```

It must fail if a demo slug such as `apex-racing-demo` is publicly available.

The Phase 1 `/admin/setup` page is a readiness landing page: it verifies the token-shaped query value, reports that infrastructure is ready, and explains that owner creation is the next setup step. It does not authenticate or persist the owner; Phase 2 replaces the form body with the real single-use setup operation while keeping the route stable.

- [ ] **Step 5: Run local and clean-Ubuntu verification**

Run locally:

```bash
node --test scripts/production/preflight.test.mjs
pnpm run production:verify
```

Then run the installer on a disposable supported Ubuntu VPS and record the exact release, image digests, domain, duration, and smoke results in `docs/release-evidence/phase-1-clean-vps.md`.

- [ ] **Step 6: Commit**

```bash
git add scripts/production/install.sh scripts/production/preflight.sh scripts/production/preflight.test.mjs scripts/production/smoke.mjs apps/console/app/setup/page.tsx apps/console/lib/setup-landing.test.ts docs/operations/production-install.md docs/release-evidence/phase-1-clean-vps.md package.json
git commit -m "feat(deploy): add supported production installer"
```

## Phase 1 Exit Gate

Run:

```bash
pnpm run ci:verify
pnpm run production:verify
```

Required evidence:

- All four Phase 0 suites pass with plain `pnpm run test`.
- No `corepack pnpm` invocation exists.
- Production images build and production Compose validates.
- A clean Ubuntu VPS reaches the setup page through valid HTTPS.
- PostgreSQL and PostgREST are not publicly reachable.
- No production demo data is loaded.
- Existing development-stack changes are preserved in separate verified commits.
