# Docker-First Self-Contained Development Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `docker compose up --build -d` produce a migrated, seeded, usable local Reservation Experience Platform at ports 4100, 4300, and 4400 without host Node, pnpm, Supabase, or generated `.env` prerequisites.

**Architecture:** A private Compose network connects PostgreSQL 16, PostgREST, a narrow nginx REST gateway, the existing standalone API image, and standalone Next.js console/booking images. One-shot Node-based stack tools generate persistent local credentials, apply the checked-in migration index with a checksum ledger, and seed only an uninitialized demo database; guarded reset and destroy services are explicit destructive paths.

**Tech Stack:** Docker Compose, Docker BuildKit, Node.js 24 Alpine, pnpm 10.33.2, PostgreSQL 16, PostgREST, nginx Alpine, Next.js 16 standalone output, Node's built-in test runner.

## Global Constraints

- Preserve the existing root `Dockerfile` API target and its production behavior outside Compose.
- Apply only core migrations `000001` through `000020`; never apply optional AI retrieval or development seed assets by default.
- Generate database, JWT, API service, PostgREST token, and WhatsApp encryption secrets inside Docker; never write them to tracked files or logs.
- Bind public ports to `127.0.0.1` and allow only checked-in local frontend origins in CORS.
- Keep the console service API key server-only; the booking image receives no database or owner credential.
- Preserve database, generated configuration, and WhatsApp session volumes across ordinary `docker compose down` and restart operations.
- Run the final-demo seed once on an empty local stack; only `reservation-reset` may intentionally replace it later.
- Require `RESERVATION_STACK_DESTROY_CONFIRM=DESTROY_LOCAL_STACK` before clearing Compose-managed local data.
- Do not add Supabase Auth, Storage, Realtime, Studio, GoTrue, Edge Functions, or analytics infrastructure.
- Do not modify or stage pre-existing unrelated changes, especially `docs/manuals/backend-modules-dev-user-manual.html` and `tmp/`, without reconciling their current contents first.

---

## File Map

**Create**

- `Dockerfile.web` — shared dependency/build stages and separate standalone console/booking runtime targets.
- `Dockerfile.local-stack` — small Node/PostgreSQL-client image for config, migration, seed, reset, and verification jobs.
- `docker/local-stack/run-with-config.sh` — loads exactly one generated service env file before executing the image command.
- `docker/local-stack/nginx.conf` — exposes only `/rest/v1` to PostgREST and a gateway health endpoint.
- `scripts/local-stack-config.mjs` and `.test.mjs` — atomic, persistent secret and signed JWT generation.
- `scripts/local-stack-migrate.mjs` and `.test.mjs` — index validation, SHA-256 ledger comparison, ordered psql application, and drift failure.
- `scripts/local-stack-seed.mjs` and `.test.mjs` — strict local target validation, first-run marker, explicit reset mode, and psql execution.
- `scripts/local-stack-destroy.mjs` and `.test.mjs` — confirmation guard and fixed-path volume-content clearing.
- `scripts/verify-local-stack.mjs` and `.test.mjs` — static Compose contract and live URL/demo checks.
- `tests/docker/local-stack-persistence.test.mjs` — opt-in live marker persistence proof.

**Modify**

- `docker-compose.yml` — replace the single API service with the supported local stack and profiles.
- `Dockerfile` — add only the generated-config wrapper required by the Compose API service.
- `.dockerignore` — exclude local volumes, sessions, temp artifacts, and environment material.
- `apps/console/next.config.ts`, `apps/booking/next.config.ts` — enable standalone output with monorepo tracing root.
- `apps/booking/lib/platform-client-config.ts` and test — separate internal server API origin from browser API origin.
- `apps/booking/lib/platform-client.ts`, `apps/booking/app/[slug]/book/page.tsx`, `apps/booking/app/[slug]/chat/page.tsx` — use internal origin server-side and localhost origin in client components.
- `package.json` — add optional contributor aliases and stack verification scripts.
- `scripts/verify-docker-deployment-files.mjs` — verify the new Compose contract without weakening production deployment checks.
- `docs/operations/backend-deployment.md` — distinguish the development stack from production hosting.
- `docs/manuals/backend-modules-dev-user-manual.html` — make Docker Compose the primary tutorial after reconciling existing edits.

---

### Task 1: Generate Persistent Local Credentials

**Files:**
- Create: `scripts/local-stack-config.mjs`
- Create: `scripts/local-stack-config.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `RESERVATION_STACK_CONFIG_DIR`, defaulting to `/run/reservation-stack`.
- Produces: `database-password`, `postgrest.conf`, `api.env`, `console.env`, `booking.env`, and `stack.env` with mode `0600`; exports `ensureLocalStackConfig(directory)` and `signLocalJwt(payload, secret)`.

- [ ] **Step 1: Write failing tests for stable, distinct, non-logged secrets**

Create tests that use `mkdtemp`, call `ensureLocalStackConfig()` twice, and assert byte-identical second-run files; parse the JWT payloads and verify HMAC-SHA256 signatures with `timingSafeEqual`; assert the anon and service-role tokens differ; assert file modes are `0o600`; and assert captured stdout does not contain any file value.

```js
test("local stack config is generated once and remains stable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reservation-stack-config-"));
  const first = await ensureLocalStackConfig(directory);
  const second = await ensureLocalStackConfig(directory);
  assert.deepEqual(second, first);
  assert.notEqual(first.anonToken, first.serviceRoleToken);
  assert.match(first.apiEnv, /^RESERVATION_SUPABASE_URL=http:\/\/reservation-gateway$/mu);
  assert.match(first.consoleEnv, /^RESERVATION_CONSOLE_TENANT_ID=final_demo$/mu);
  assert.match(first.bookingEnv, /^RESERVATION_PLATFORM_PUBLIC_BASE_URL=http:\/\/localhost:4100$/mu);
});
```

- [ ] **Step 2: Run the tests and confirm the module is missing**

Run: `node --test scripts/local-stack-config.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/local-stack-config.mjs`.

- [ ] **Step 3: Implement atomic generation**

Use `randomBytes(32).toString("base64url")` for the database password, JWT secret, service API key, and WhatsApp encryption key. Sign tokens as `base64url(header).base64url(payload).base64url(HMAC)` with payloads `{ role: "anon", iss: "reservation-local-stack" }` and `{ role: "service_role", iss: "reservation-local-stack" }`. Write each file to `<name>.tmp`, `chmod(0o600)`, then `rename`; if all required files already exist, read and return them without regeneration. The CLI may print only `Local stack configuration is ready.`

The generated API env must contain:

```dotenv
RESERVATION_SUPABASE_URL=http://reservation-gateway
RESERVATION_SUPABASE_ANON_KEY=<signed anon JWT>
RESERVATION_SUPABASE_SERVICE_ROLE_KEY=<signed service_role JWT>
RESERVATION_PLATFORM_SERVICE_API_KEY=<random service API key>
RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS=http://localhost:4300,http://127.0.0.1:4300,http://localhost:4400,http://127.0.0.1:4400
RESERVATION_WHATSAPP_ENABLED=true
RESERVATION_WHATSAPP_PROVIDER=session_qr
RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY=<random encryption key>
RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE=false
RESERVATION_WHATSAPP_SIMULATION_ENABLED=true
```

The generated `postgrest.conf` must set `db-uri` to the internal PostgreSQL URL, `db-schemas = "public"`, `db-anon-role = "anon"`, `jwt-secret` to the generated JWT secret, and `server-port = 3000`.

- [ ] **Step 4: Add and run the package alias**

Add `"local-stack:test": "node --test scripts/local-stack-*.test.mjs"` to root scripts.

Run: `pnpm run local-stack:test`

Expected: all config tests PASS and no secret appears in output.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/local-stack-config.mjs scripts/local-stack-config.test.mjs
git commit -m "feat(dev-stack): generate persistent local credentials"
```

---

### Task 2: Apply Indexed Migrations with a Drift Ledger

**Files:**
- Create: `scripts/local-stack-migrate.mjs`
- Create: `scripts/local-stack-migrate.test.mjs`
- Create: `Dockerfile.local-stack`

**Interfaces:**
- Consumes: `packages/database/migrations/supabase/migration-index.json`, repo-relative SQL paths, `RESERVATION_DATABASE_URL`, and `PSQL_BIN`.
- Produces: `planCoreMigrations(index, ledgerRows)` and CLI behavior that records `(filename, sha256, applied_at)` in `public.reservation_local_migration_ledger`.

- [ ] **Step 1: Write migration planner tests**

Cover exact `000001`–`000020` order, skip of byte-identical ledger rows, rejection of a changed checksum, rejection of optional/development entries, and rejection of any core count other than 20.

```js
test("planner skips identical rows and fails closed on drift", () => {
  const index = fixtureIndex();
  assert.equal(planCoreMigrations(index, []).length, 20);
  assert.equal(planCoreMigrations(index, [{ filename: index.coreMigrations[0].path, sha256: index.coreMigrations[0].sha256 }]).length, 19);
  assert.throws(
    () => planCoreMigrations(index, [{ filename: index.coreMigrations[0].path, sha256: "f".repeat(64) }]),
    /changed after it was applied/u,
  );
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test scripts/local-stack-migrate.test.mjs`

Expected: FAIL because the migration module does not exist.

- [ ] **Step 3: Implement the planner and psql runner**

Load the index, require exactly 20 sorted core entries with order `1..20`, recompute every file checksum and byte count before connecting, create the ledger table, read existing rows as tab-separated output, and call psql once per pending file with `--set ON_ERROR_STOP=1 --no-psqlrc --file <absolute path>`. Insert the ledger row only after the migration command succeeds. Never include the database URL or password in log messages.

```sql
create table if not exists public.reservation_local_migration_ledger (
  filename text primary key,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz not null default now()
);
```

- [ ] **Step 4: Create the stack-tools image**

Use `node:24-alpine`, install `postgresql16-client` and `curl` with `apk --no-cache`, copy only `package.json`, migration assets, final-demo seed, local-stack scripts, and `docker/local-stack`; set `/app` as `WORKDIR`. Do not run `pnpm install` because the scripts use only Node built-ins and psql.

- [ ] **Step 5: Verify tests and image build**

Run:

```bash
node --test scripts/local-stack-migrate.test.mjs
docker build -f Dockerfile.local-stack -t reservation-platform-stack-tools:test .
```

Expected: tests PASS and image build exits 0.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile.local-stack scripts/local-stack-migrate.mjs scripts/local-stack-migrate.test.mjs
git commit -m "feat(dev-stack): apply indexed migrations with drift checks"
```

---

### Task 3: Guard First-Run Seed, Reset, and Destruction

**Files:**
- Create: `scripts/local-stack-seed.mjs`
- Create: `scripts/local-stack-seed.test.mjs`
- Create: `scripts/local-stack-destroy.mjs`
- Create: `scripts/local-stack-destroy.test.mjs`
- Modify: `Dockerfile.local-stack`

**Interfaces:**
- Consumes: only database identity `postgresql://postgres@reservation-db:5432/reservation`, `packages/database/seeds/final-demo.sql`, `RESERVATION_STACK_SEED_MODE=first-run|reset`, and `RESERVATION_STACK_DESTROY_CONFIRM`.
- Produces: database marker key `final-demo-v1`; exports `assertLocalStackDatabaseTarget(url)`, `shouldApplySeed(marker, mode)`, and `assertDestroyConfirmation(env)`.

- [ ] **Step 1: Write guard tests**

```js
test("seed accepts only the fixed Compose database identity", () => {
  assert.doesNotThrow(() => assertLocalStackDatabaseTarget("postgresql://postgres@reservation-db:5432/reservation"));
  for (const url of [
    "postgresql://postgres@localhost:5432/reservation",
    "postgresql://postgres@reservation-db:5432/production",
    "postgresql://admin@reservation-db:5432/reservation",
  ]) assert.throws(() => assertLocalStackDatabaseTarget(url), /Compose-managed local database/u);
});

test("destroy requires the exact confirmation", () => {
  assert.throws(() => assertDestroyConfirmation({}), /DESTROY_LOCAL_STACK/u);
  assert.doesNotThrow(() => assertDestroyConfirmation({ RESERVATION_STACK_DESTROY_CONFIRM: "DESTROY_LOCAL_STACK" }));
});
```

Also assert first-run skips an existing marker and reset always runs.

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test scripts/local-stack-seed.test.mjs scripts/local-stack-destroy.test.mjs`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement seed marker behavior**

Create `public.reservation_local_stack_state(key text primary key, value jsonb not null, updated_at timestamptz not null default now())`. In `first-run` mode, skip when `final-demo-v1` exists; otherwise execute the guarded seed with psql and upsert the marker only after success. In `reset` mode, always execute the seed and refresh the marker. Reject every database URL except the fixed internal identity before spawning psql.

- [ ] **Step 4: Implement fixed-path destruction**

After exact confirmation, require fixed mount roots `/volumes/database`, `/volumes/config`, and `/volumes/whatsapp`; reject symlinks and any resolved path outside `/volumes`; delete only children beneath those three directories. Print only `Local stack data destroyed.` The Compose service must not accept a database URL and must not mount the Docker socket.

- [ ] **Step 5: Run guard tests**

Run: `pnpm run local-stack:test`

Expected: all local stack unit tests PASS.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile.local-stack scripts/local-stack-seed.mjs scripts/local-stack-seed.test.mjs scripts/local-stack-destroy.mjs scripts/local-stack-destroy.test.mjs
git commit -m "feat(dev-stack): guard demo lifecycle operations"
```

---

### Task 4: Separate Internal and Browser Booking Origins

**Files:**
- Modify: `apps/booking/lib/platform-client-config.ts`
- Modify: `apps/booking/lib/platform-client-config.test.ts`
- Modify: `apps/booking/lib/platform-client.ts`
- Modify: `apps/booking/app/[slug]/book/page.tsx`
- Modify: `apps/booking/app/[slug]/chat/page.tsx`

**Interfaces:**
- Consumes: `RESERVATION_PLATFORM_BASE_URL` and optional `RESERVATION_PLATFORM_PUBLIC_BASE_URL`.
- Produces: `BookingPlatformConfig { serverBaseUrl: string; publicBaseUrl: string }`; browser components never receive `reservation-api` as a hostname.

- [ ] **Step 1: Extend the config tests**

```ts
assert.deepEqual(readBookingPlatformConfig({
  RESERVATION_PLATFORM_BASE_URL: "http://reservation-api:4100",
  RESERVATION_PLATFORM_PUBLIC_BASE_URL: "http://localhost:4100",
}), {
  serverBaseUrl: "http://reservation-api:4100",
  publicBaseUrl: "http://localhost:4100",
});

assert.deepEqual(readBookingPlatformConfig({
  RESERVATION_PLATFORM_BASE_URL: "https://api.example",
}), {
  serverBaseUrl: "https://api.example",
  publicBaseUrl: "https://api.example",
});
```

Keep the existing assertion forbidding service keys, Supabase names, and `NEXT_PUBLIC_*` usage.

- [ ] **Step 2: Run the focused test and confirm the shape mismatch**

Run: `pnpm --filter @reservation-platform/booking run test`

Expected: FAIL because the current function returns `{ baseUrl }`.

- [ ] **Step 3: Implement the two-origin contract**

Normalize both values, require the server value, default the public value to the server value for non-Compose deployments, use `serverBaseUrl` in `createBookingPlatformClient`, and pass `publicBaseUrl` to `PublicBookingJourney` and `PublicChat`.

- [ ] **Step 4: Verify booking behavior**

Run:

```bash
pnpm --filter @reservation-platform/booking run test
pnpm --filter @reservation-platform/booking run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/booking
git commit -m "fix(booking): separate server and browser API origins"
```

---

### Task 5: Build Production Console and Booking Images

**Files:**
- Create: `Dockerfile.web`
- Create: `docker/local-stack/run-with-config.sh`
- Modify: `apps/console/next.config.ts`
- Modify: `apps/booking/next.config.ts`
- Modify: `Dockerfile`

**Interfaces:**
- Consumes: read-only `/run/reservation-stack/<service>.env` generated in Task 1.
- Produces: Docker targets `console-runtime` and `booking-runtime`, both running as UID 1001; existing API `runtime` target gains the same wrapper without changing its default application command.

- [ ] **Step 1: Add standalone Next configuration**

Add `output: "standalone"` and `outputFileTracingRoot: repoRoot` to both existing `NextConfig` objects while preserving `transpilePackages` and `turbopack`.

- [ ] **Step 2: Add the strict wrapper**

`run-with-config.sh` must accept exactly one readable env-file path followed by a command, export non-comment `NAME=value` lines without echoing them, unset temporary parsing variables, and `exec` the command. It must fail when the file is missing or a line has an invalid variable name.

```sh
#!/bin/sh
set -eu
config_file="$1"
shift
test -r "$config_file"
set -a
. "$config_file"
set +a
exec "$@"
```

Generated values contain only URL-safe/base64url characters and fixed URLs, so shell sourcing is deterministic.

- [ ] **Step 3: Create the web multi-stage build**

Use the pinned workspace package manager via Corepack inside the image, copy workspace manifests before `pnpm install --frozen-lockfile`, then build with `pnpm --filter @reservation-platform/console run build` and the equivalent booking filter. Each runtime target copies its app's `.next/standalone`, `.next/static`, and `public` directory if present, runs as `reservation`, exposes its fixed port, and starts the generated standalone `server.js` with `HOSTNAME=0.0.0.0`.

- [ ] **Step 4: Wrap only Compose runtime startup**

Copy `run-with-config.sh` into the existing API runtime image. Keep `CMD ["node", "apps/api/dist/server.js"]`; Compose will override `entrypoint` to load `api.env`, so standalone production users retain current behavior.

- [ ] **Step 5: Build and smoke the image targets**

Run:

```bash
docker build --target runtime -t reservation-platform-api:test .
docker build -f Dockerfile.web --target console-runtime -t reservation-platform-console:test .
docker build -f Dockerfile.web --target booking-runtime -t reservation-platform-booking:test .
```

Expected: all three builds exit 0; neither web runtime contains a service-role token or generated local config file.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile Dockerfile.web docker/local-stack/run-with-config.sh apps/console/next.config.ts apps/booking/next.config.ts
git commit -m "feat(dev-stack): containerize standalone web apps"
```

---

### Task 6: Define the Complete Compose Stack

**Files:**
- Modify: `docker-compose.yml`
- Create: `docker/local-stack/nginx.conf`
- Modify: `.dockerignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: images and scripts from Tasks 1–5.
- Produces: default services `reservation-config`, `reservation-db`, `reservation-migrate`, `reservation-seed`, `reservation-rest`, `reservation-gateway`, `reservation-api`, `reservation-console`, `reservation-booking`; run-only services `reservation-reset`, `reservation-destroy`; volumes `reservation-db-data`, `reservation-stack-config`, `reservation-whatsapp-sessions`; private network `reservation-stack`.

- [ ] **Step 1: Add the narrow REST gateway**

Configure nginx to return 200 at `/health`, proxy `/rest/v1/` to `http://reservation-rest:3000/`, preserve `Authorization`, `apikey`, `Content-Type`, `Prefer`, `Range`, and `Content-Range`, and return 404 for every other route. Do not publish the gateway port.

- [ ] **Step 2: Replace the Compose topology**

Set these dependency gates:

```yaml
reservation-db:
  depends_on:
    reservation-config: { condition: service_completed_successfully }
reservation-migrate:
  depends_on:
    reservation-db: { condition: service_healthy }
reservation-seed:
  depends_on:
    reservation-migrate: { condition: service_completed_successfully }
reservation-rest:
  depends_on:
    reservation-migrate: { condition: service_completed_successfully }
reservation-gateway:
  depends_on:
    reservation-rest: { condition: service_healthy }
reservation-api:
  depends_on:
    reservation-seed: { condition: service_completed_successfully }
    reservation-gateway: { condition: service_healthy }
reservation-console:
  depends_on:
    reservation-api: { condition: service_healthy }
reservation-booking:
  depends_on:
    reservation-api: { condition: service_healthy }
```

Bind `127.0.0.1:4100:4100`, `127.0.0.1:4300:4300`, and `127.0.0.1:4400:4400`. Do not publish PostgreSQL, PostgREST, or gateway ports. Mount generated config read-only everywhere except `reservation-config`; mount WhatsApp sessions only into the API and destroy services. Configure health checks with `pg_isready`, PostgREST `/`, gateway `/health`, API `/v1/health`, and frontend `/` probes.

Use `postgres:16-alpine` with database `reservation`, user `postgres`, and `POSTGRES_PASSWORD_FILE=/run/reservation-stack/database-password`. Use `postgrest/postgrest:v12.2.12` and `nginx:1.27.5-alpine`; never use `latest`.

- [ ] **Step 3: Add reset and destroy run-only services**

Put both behind profile `operations` so they never start during normal `up`. Reset uses the existing config/database volumes, fixed internal URL, and `RESERVATION_STACK_SEED_MODE=reset`. Destroy mounts all three named volumes at the fixed `/volumes/*` paths and receives only `RESERVATION_STACK_DESTROY_CONFIRM`.

- [ ] **Step 4: Expand ignore rules and aliases**

Ignore `tmp/`, `data/whatsapp-sessions/`, `.reservation-whatsapp-sessions/`, `.env*` except `.env.example`, all `.next` and build output, database volume directories, and handbook temporary artifacts.

Add aliases:

```json
"stack:up": "docker compose up --build -d",
"stack:logs": "docker compose logs -f",
"stack:reset": "docker compose --profile operations run --rm reservation-reset",
"stack:down": "docker compose down",
"stack:destroy": "docker compose --profile operations run --rm reservation-destroy"
```

- [ ] **Step 5: Validate the rendered Compose model**

Run:

```bash
docker compose config --quiet
docker compose config --services
docker compose config --volumes
```

Expected: config validation exits 0; the service list includes all eleven service names; the volume list contains exactly the three named stack volumes.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml docker/local-stack/nginx.conf .dockerignore package.json
git commit -m "feat(dev-stack): define self-contained Compose platform"
```

---

### Task 7: Automate Static and Live Stack Verification

**Files:**
- Create: `scripts/verify-local-stack.mjs`
- Create: `scripts/verify-local-stack.test.mjs`
- Create: `tests/docker/local-stack-persistence.test.mjs`
- Modify: `scripts/verify-docker-deployment-files.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: rendered Compose JSON, generated config directory, health URLs, optional `RESERVATION_STACK_LIVE_TESTS=true`.
- Produces: `stack:verify` static checks and `stack:verify:live` fresh-stack/persistence checks.

- [ ] **Step 1: Write static contract tests**

Spawn `docker compose config --format json`, parse it, and assert service names, localhost bindings, health checks, dependency conditions, read-only config mounts, private unpublished database/REST/gateway, operations profiles, and three persistent volumes. Scan tracked Docker sources for usable JWT-shaped strings and assignments containing literal secret values.

- [ ] **Step 2: Extend deployment-file verification**

Replace old assertions that expect host-injected Supabase variables and a single API-only Compose service. Retain verification of the API image's non-root runtime, health path, existing command, `.env` documentation for non-stack deployments, forbidden public secret names, and production deployment guidance.

- [ ] **Step 3: Add live verification**

`verify-local-stack.mjs --live` must wait with a bounded timeout, then require 2xx from API `/v1/health`, console `/`, booking `/apex-racing-demo`, and gateway health from inside its network; run `pnpm run demo:verify` inside the tools image against the internal database; make one authenticated console API request using the generated service key without printing it.

- [ ] **Step 4: Add persistence proof**

When `RESERVATION_STACK_LIVE_TESTS=true`, insert marker `persistence-proof` into `reservation_local_stack_state`, run `docker compose down`, run `docker compose up --build -d`, wait for readiness, and assert the same marker value remains. Use `test.after` to call `docker compose down` without `--volumes`.

- [ ] **Step 5: Wire scripts and run static checks**

Add:

```json
"stack:verify": "node scripts/verify-local-stack.mjs",
"stack:verify:live": "RESERVATION_STACK_LIVE_TESTS=true node --test tests/docker/local-stack-persistence.test.mjs"
```

Run:

```bash
pnpm run local-stack:test
pnpm run stack:verify
pnpm run deploy:verify
```

Expected: all commands PASS without starting or pulling stack services.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/verify-local-stack.mjs scripts/verify-local-stack.test.mjs scripts/verify-docker-deployment-files.mjs tests/docker/local-stack-persistence.test.mjs
git commit -m "test(dev-stack): verify topology and lifecycle safety"
```

---

### Task 8: Prove a Fresh Stack and Destructive Guards

**Files:**
- Test only; fix only files introduced or modified by Tasks 1–7 when a proof fails.

**Interfaces:**
- Consumes: the complete Compose stack.
- Produces: reproducible build, startup, data, restart, reset, and destroy evidence.

- [ ] **Step 1: Start from empty Compose-managed state**

Run the guarded destroy path only after the stack is down:

```bash
docker compose down
RESERVATION_STACK_DESTROY_CONFIRM=DESTROY_LOCAL_STACK docker compose --profile operations run --rm reservation-destroy
docker compose up --build -d
```

Expected: all one-shot services exit 0 and all long-running services become healthy.

- [ ] **Step 2: Verify applications and demo data**

Run:

```bash
docker compose ps
curl --fail http://localhost:4100/v1/health
curl --fail http://localhost:4300/
curl --fail http://localhost:4400/apex-racing-demo
pnpm run demo:verify
```

Expected: all checks PASS; logs contain no generated secret and no raw WhatsApp QR payload.

- [ ] **Step 3: Run smoke and presentation-critical E2E checks**

Run with the stack's API origin and generated server credential injected only into the test process:

```bash
pnpm run test:smoke
pnpm run test:e2e
```

Expected: both suites PASS against the Docker stack.

- [ ] **Step 4: Prove restart persistence**

Run: `pnpm run stack:verify:live`

Expected: PASS and the test marker survives `down` followed by `up --build -d`.

- [ ] **Step 5: Prove reset and destroy rejection**

Run reset and confirm deterministic demo records return. Then run destroy without confirmation and with an incorrect confirmation; both must exit non-zero without changing marker data.

```bash
docker compose --profile operations run --rm reservation-reset
docker compose --profile operations run --rm reservation-destroy
RESERVATION_STACK_DESTROY_CONFIRM=wrong docker compose --profile operations run --rm reservation-destroy
```

- [ ] **Step 6: Record verification without committing runtime data**

Run `git status --short` and confirm no generated credential, database, or WhatsApp session file is tracked or untracked. Do not commit Compose volumes or test output.

---

### Task 9: Make Documentation Docker-First

**Files:**
- Modify: `docs/operations/backend-deployment.md`
- Modify after reconciliation: `docs/manuals/backend-modules-dev-user-manual.html`
- Modify if its index text is stale: `docs/manuals/README.md`

**Interfaces:**
- Consumes: verified commands and URLs from Task 8.
- Produces: one primary onboarding path and clearly separated advanced manual/production guidance.

- [ ] **Step 1: Reconcile the dirty handbook before editing**

Inspect `git diff -- docs/manuals/backend-modules-dev-user-manual.html`, preserve every unrelated current edit, and change only the Developer tutorial, deployment/local-stack lifecycle, troubleshooting, and architecture portions required by the approved design. If ownership of overlapping lines is unclear, stop and ask before modifying that file.

- [ ] **Step 2: Replace primary onboarding instructions**

The first development path must be exactly:

```bash
git clone <repository-url>
cd reservation-app
docker compose up --build -d
docker compose ps
```

Then list API `http://localhost:4100`, owner console `http://localhost:4300`, and public booking `http://localhost:4400/apex-racing-demo`, followed by an owner workflow and customer booking workflow.

- [ ] **Step 3: Document safe lifecycle commands**

Include `logs -f`, reset, down, and confirmed destroy commands. State that down preserves data, reset replaces deterministic demo data, destroy clears only Compose-managed local data, generated credentials live in a private named volume, and no secret values are printed.

- [ ] **Step 4: Move manual pnpm setup to advanced development**

Retain `pnpm install`, `local:supabase:start`, API, console, and booking terminal instructions under “Advanced manual development.” Do not imply the local stack is production Supabase or production-ready.

- [ ] **Step 5: Update production operations guidance**

In `docs/operations/backend-deployment.md`, keep external Supabase/production deployment behavior, explain that automatic migration and demo seed apply only to the local Compose stack, and retain backups, TLS, monitoring, load, RLS, and incident-readiness caveats.

- [ ] **Step 6: Verify documentation assertions**

Run:

```bash
rg -n "docker compose up --build -d|Advanced manual development|DESTROY_LOCAL_STACK|not.*production" docs/manuals/backend-modules-dev-user-manual.html docs/operations/backend-deployment.md
pnpm run deploy:verify
```

Expected: required Docker-first and boundary language is present; deployment verification PASS.

- [ ] **Step 7: Commit only reconciled documentation**

```bash
git add docs/operations/backend-deployment.md docs/manuals/backend-modules-dev-user-manual.html docs/manuals/README.md
git commit -m "docs: make local onboarding Docker-first"
```

---

### Task 10: Final Regression and Security Review

**Files:**
- Test only; make scoped fixes only when a command identifies a regression.

**Interfaces:**
- Consumes: completed implementation and documentation.
- Produces: final merge evidence.

- [ ] **Step 1: Run package and application regressions**

```bash
pnpm run test
pnpm --filter @reservation-platform/console run test
pnpm --filter @reservation-platform/console run typecheck
pnpm --filter @reservation-platform/booking run test
pnpm --filter @reservation-platform/booking run typecheck
```

Expected: all commands PASS.

- [ ] **Step 2: Run boundaries and security checks**

```bash
pnpm run packages:verify-boundaries
pnpm run database:verify-migration-bundle
pnpm run deploy:verify
pnpm run stack:verify
```

Expected: all commands PASS.

- [ ] **Step 3: Inspect images and logs for secrets**

Check `docker compose logs --no-color` for JWTs, database passwords, service keys, WhatsApp encryption keys, and QR payload labels; inspect web container environments to prove the booking service has no service/database credential and the console has no database credential.

- [ ] **Step 4: Confirm worktree scope**

Run `git status --short` and `git diff --check`. Confirm no tracked credential, generated config, volume data, session file, `tmp/` artifact, or unrelated source change is included.

- [ ] **Step 5: Stop without deleting verification data**

Run: `docker compose down`

Expected: containers/network stop; the three named volumes remain.

---

## Self-Review Results

- **Spec coverage:** Tasks 1–3 cover generated credentials, migration ledger/drift, first seed, reset, and destroy safety. Tasks 4–6 cover split networking, API/web images, all required services, volumes, health checks, localhost bindings, simulation, and narrow Supabase-compatible REST. Tasks 7–8 cover static, build, fresh-stack, health, demo, authenticated, E2E, persistence, and destructive guard proofs. Task 9 covers Docker-first handbook and production boundaries. Task 10 covers regressions, secret scanning, and final scope.
- **Deliberate boundaries:** No task adds the complete Supabase suite, optional AI retrieval migrations, automatic recurring reset, new microservices, or production-readiness claims.
- **Type consistency:** Task 4 consistently defines and consumes `serverBaseUrl` and `publicBaseUrl`; Tasks 2–3 use the fixed database identity and shared psql execution contract; Task 1 file names match the mounts and wrappers used in Tasks 5–6.
- **Placeholder scan:** No implementation step contains deferred behavior; angle-bracket values appear only where runtime-generated secrets or the user's repository URL are intentionally supplied.
