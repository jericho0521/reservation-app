# Phase 5: Operations, Recovery, and Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the installation observable, abuse-resistant, recoverable, safely upgradeable, and polished enough for daily non-technical operation.

**Architecture:** PostgreSQL stores worker heartbeats, rate-limit windows, backup/upgrade records, and safe operational events. Public liveness remains shallow; readiness checks dependencies; the authenticated status API aggregates safe health. Production tools perform encrypted backups and versioned upgrades from outside application containers.

**Tech Stack:** PostgreSQL, Node HTTP runtime, structured JSON logs, Docker Compose, `pg_dump`/`pg_restore`, `age`, Caddy, Next.js, and Node test runner.

## Global Constraints

- Follow the master plan and preserve the Phase 1 generated backup recovery key outside backup archives.
- Health and support output must not include secrets, cookies, QR payloads, message bodies, or customer details.
- Backups and upgrades are failed operations until their verification step succeeds.
- Operational polish may be cut only after every recovery/security gate passes.

---

### Task 1: Add Operational State, Heartbeats, and Persistent Rate Limits

**Files:**
- Create: `packages/database/migrations/supabase/000027_system_operations.sql`
- Modify: migration index and migration test
- Create: `packages/reservations-supabase/src/system-operations.ts`
- Create: `packages/reservations-supabase/src/system-operations.test.ts`
- Modify: `packages/reservations-supabase/src/index.ts`

**Interfaces:**
- Produces: `SystemOperationsRepository` for heartbeat, rate limit, backup, upgrade, and bounded event metadata.

- [ ] **Step 1: Extend the exact migration plan through `000026`**

Append `000027_system_operations.sql`, run the database test, and confirm it fails before the migration/index exist.

- [ ] **Step 2: Add operational tables and RPCs**

```sql
create table public.platform_component_heartbeats (
  component text primary key,
  instance_id text not null,
  release_version text not null,
  status text not null check (status in ('healthy', 'degraded')),
  metadata jsonb not null default '{}'::jsonb,
  heartbeat_at timestamptz not null
);

create table public.platform_rate_limit_windows (
  bucket_hash text not null,
  route_group text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  expires_at timestamptz not null,
  primary key (bucket_hash, route_group, window_started_at)
);

create table public.platform_backup_records (
  id uuid primary key default gen_random_uuid(),
  release_version text not null,
  migration_version text not null,
  archive_name text not null,
  archive_sha256 text,
  status text not null check (status in ('started', 'verified', 'failed')),
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.platform_upgrade_records (
  id uuid primary key default gen_random_uuid(),
  from_version text not null,
  to_version text not null,
  backup_id uuid references public.platform_backup_records(id),
  status text not null check (status in ('started', 'healthy', 'failed', 'rolled_back')),
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
```

Add `consume_platform_rate_limit(bucket_hash, route_group, limit, window_seconds)` as a security-definer RPC that increments atomically and returns `{ allowed, remaining, retry_after_seconds }`. Hash IP/email identifiers before storage.

- [ ] **Step 3: Implement and test the adapter**

```ts
export interface SystemOperationsRepository {
  heartbeat(input: ComponentHeartbeat): Promise<void>;
  readHeartbeats(): Promise<readonly ComponentHeartbeat[]>;
  consumeRateLimit(input: RateLimitInput): Promise<RateLimitDecision>;
  recordBackup(input: BackupRecordInput): Promise<BackupRecord>;
  recordUpgrade(input: UpgradeRecordInput): Promise<UpgradeRecord>;
}
```

Test atomic limit consumption, expired windows, stale heartbeat detection, and status transitions that reject `verified -> started` or `healthy -> started` regressions.

- [ ] **Step 4: Regenerate, verify, and commit**

Run migration index generation, database tests, adapter tests, and bundle verification.

```bash
git add packages/database packages/reservations-supabase/src/system-operations* packages/reservations-supabase/src/index.ts
git commit -m "feat(operations): persist health and release state"
```

### Task 2: Add Liveness, Readiness, and the Authenticated System Status Page

**Files:**
- Create: `packages/reservation-platform-api/src/system-status.ts`
- Create: `packages/reservation-platform-api/src/system-status.test.ts`
- Modify: `packages/reservation-platform-api/src/index.ts`
- Modify: contracts and generated artifacts
- Modify: SDK methods/tests
- Modify: `apps/api/src/routes.ts`
- Modify: `apps/api/src/routes.test.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/worker/src/server.ts`
- Create: `apps/console/app/system/page.tsx`
- Create: `apps/console/components/system/component-status.tsx`
- Create: `apps/console/lib/system-status.ts`
- Create: `apps/console/lib/system-status.test.ts`

**Interfaces:**
- Produces: `GET /v1/health/live`, `GET /v1/health/ready`, and authenticated `GET /v1/system/status`.

- [ ] **Step 1: Write health-semantics tests**

```ts
test("liveness is healthy while database readiness is failed", async () => {
  assert.equal((await readLiveness()).status, 200);
  const ready = await readReadiness(fixture({ database: "offline" }));
  assert.equal(ready.status, 503);
  assert.deepEqual(ready.body, { status: "unready", checks: { database: "failed" } });
});

test("system status degrades on a stale worker heartbeat", async () => {
  const status = await readSystemStatus(fixture({ workerHeartbeatAgeSeconds: 120 }));
  assert.equal(status.components.worker.status, "offline");
});
```

- [ ] **Step 2: Implement safe probes**

Liveness checks only that the API event loop can answer. Readiness checks database connectivity, migration version exactly matching the image-required version, and ability to read the installation row. It returns component names and safe status only.

System status adds job queue depth/oldest age, worker heartbeat, email test/delivery state, AI enabled/test state, WhatsApp connection heartbeat, disk percentage from a bounded runtime probe, last verified backup, release version, and migration version.

- [ ] **Step 3: Add worker heartbeat**

The worker writes heartbeat at startup and every 15 seconds with release version and `healthy|degraded`. A heartbeat older than 45 seconds is offline. Heartbeat failure logs a safe error and degrades worker readiness.

- [ ] **Step 4: Build the action-first status page**

Use healthy/degraded/offline states with the last successful time and one recovery action. Do not show raw exception messages. Place failed jobs, disconnected WhatsApp, missing backup, and low disk in the overview attention list.

- [ ] **Step 5: Verify and commit**

Run platform API, API app, worker, SDK, console tests/build, and production smoke health probes.

```bash
git add packages/reservation-platform-api/src/system-status* packages/reservation-platform-api/src/index.ts packages/contract-types packages/sdk/src apps/api/src apps/worker/src apps/console
git commit -m "feat(operations): expose dependency-aware system health"
```

### Task 3: Enforce Rate Limits, Safe Logs, and Security Boundaries

**Files:**
- Create: `packages/platform-config/src/safe-logger.ts`
- Create: `packages/platform-config/src/safe-logger.test.ts`
- Modify: `packages/platform-config/src/index.ts`
- Create: `apps/api/src/rate-limit.ts`
- Create: `apps/api/src/rate-limit.test.ts`
- Modify: `apps/api/src/routes.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/worker/src/server.ts`
- Modify: `scripts/verify-final-security.mjs`
- Modify: `scripts/verify-final-security.test.mjs`
- Modify: `docker/production/Caddyfile`

**Interfaces:**
- Consumes: `SystemOperationsRepository.consumeRateLimit`.
- Produces: structured redacted logger and route-group rate decisions.

- [ ] **Step 1: Write redaction and route-limit tests**

```ts
test("safe logger redacts nested credentials and message content", () => {
  const output = safeLogValue({ authorization: "Bearer secret", qr_code: "private", content: "customer text", error_code: "timeout" });
  assert.deepEqual(output, { authorization: "[REDACTED]", qr_code: "[REDACTED]", content: "[REDACTED]", error_code: "timeout" });
});

test("login limit returns retry-after without revealing the account", async () => {
  const response = await applyRateLimit(loginRequest, fixture({ allowed: false, retryAfterSeconds: 60 }));
  assert.equal(response.status, 429);
  assert.equal(response.headers["retry-after"], "60");
});
```

- [ ] **Step 2: Implement one structured logger contract**

Allow only known fields: timestamp, level, event, component, release, correlation ID, route template, status, duration, safe error code, job kind, attempts, and safe counts. Recursively redact keys matching authorization, cookie, password, token, secret, api key, credential, QR, message content, prompt, and session.

- [ ] **Step 3: Apply route-group limits**

Use these initial fixed windows:

```text
login:             10 requests / 15 minutes / IP+normalized-email hash
setup:              5 requests / 15 minutes / IP
public_booking:    30 requests / minute / IP
public_chat:       20 requests / minute / IP+conversation
whatsapp_pairing:   5 requests / 10 minutes / owner
password_reset:     5 requests / hour / IP+normalized-email hash
```

Return `429` with `Retry-After`; never reveal whether an email exists. Trusted internal worker calls use service identity and are not bucketed as public traffic.

- [ ] **Step 4: Harden Caddy and request limits**

Keep TLS/HSTS/security headers, disable server identity headers, restrict methods, and set a 1 MiB global API body ceiling with tighter 64 KiB JSON limits in API routing. Exact origin credentials remain required.

- [ ] **Step 5: Extend security verification**

Reject console/browser imports of service credentials, public database/PostgREST ports, wildcard credentialed CORS, missing production WhatsApp encryption, QR logging patterns, unpinned production images, and secret-like values in tracked production config.

- [ ] **Step 6: Verify and commit**

Run platform-config, API, worker, final-security, production-deployment, and boundary tests.

```bash
git add packages/platform-config/src apps/api/src apps/worker/src scripts/verify-final-security.mjs scripts/verify-final-security.test.mjs docker/production/Caddyfile
git commit -m "feat(security): enforce rate limits and redacted logs"
```

### Task 4: Implement Encrypted Backup and Verified Restore

**Files:**
- Create: `scripts/production/backup.sh`
- Create: `scripts/production/restore.sh`
- Create: `scripts/production/backup-manifest.mjs`
- Create: `scripts/production/backup-manifest.test.mjs`
- Create: `scripts/production/verify-backup.sh`
- Modify: `Dockerfile.production-tools`
- Modify: `compose.production.yml`
- Create: `docs/operations/backup-restore.md`

**Interfaces:**
- Consumes: PostgreSQL, protected installation key directory, WhatsApp data volume, and the separate backup recovery key.
- Produces: `.tar.age` archive plus SHA-256 sidecar and verified restore operation.

- [ ] **Step 1: Write manifest validation tests**

```js
test("restore rejects a backup without required key material", () => {
  const result = validateBackupManifest({
    schemaVersion: 1,
    files: ["database.dump"],
  migrationVersion: "000027",
  });
  assert.deepEqual(result.errors, ["missing secrets/installation-master-key", "missing secrets/whatsapp-session-key"]);
});
```

Test checksum mismatch, unsupported schema version, newer migration version, missing database dump, missing WhatsApp state declaration, and insufficient disk.

- [ ] **Step 2: Define the archive manifest**

```ts
export interface BackupManifestV1 {
  schemaVersion: 1;
  createdAt: string;
  releaseVersion: string;
  migrationVersion: string;
  installationId: string;
  databaseSha256: string;
  files: readonly string[];
}
```

Required archive entries are `manifest.json`, `database.dump`, installation/session/internal keys needed by restored services, and `whatsapp/`. Explicitly exclude `backup-recovery-key`, logs, temporary QR state, and Caddy certificates.

- [ ] **Step 3: Implement backup**

Inside the tools container: acquire a PostgreSQL advisory lock for backup metadata, run `pg_dump --format=custom`, copy protected files and WhatsApp state into a mode-0700 staging directory, write manifest/checksums, archive, encrypt with `age --passphrase` reading the recovery key file, verify decryption and manifest in a second temporary directory, then atomically move the archive and mark the backup record `verified`.

Delete plaintext staging through a cleanup trap on success or failure.

- [ ] **Step 4: Implement restore**

Require explicit `--archive` and `--confirm-restore <installation-id>`. Decrypt into a temporary mode-0700 directory, validate checksum/version/disk, stop API/worker/console/booking, restore PostgreSQL into a fresh database, restore key/session files, start services, and run readiness/smoke. Preserve the previous volumes until smoke succeeds; on failure restart them.

- [ ] **Step 5: Run an actual clean restore drill**

Create a real appointment and message, back up, destroy a disposable installation, restore, then verify appointment, user login, integration credential decryption, and WhatsApp session metadata. Record hashes and observed results in `docs/release-evidence/phase-5-restore-drill.md`.

- [ ] **Step 6: Commit**

```bash
git add scripts/production/backup.sh scripts/production/restore.sh scripts/production/backup-manifest.mjs scripts/production/backup-manifest.test.mjs scripts/production/verify-backup.sh Dockerfile.production-tools compose.production.yml docs/operations/backup-restore.md docs/release-evidence/phase-5-restore-drill.md
git commit -m "feat(operations): add encrypted backup and restore"
```

### Task 5: Implement Versioned Upgrade and Failed-Readiness Recovery

**Files:**
- Create: `scripts/production/upgrade.sh`
- Create: `scripts/production/upgrade-plan.mjs`
- Create: `scripts/production/upgrade-plan.test.mjs`
- Create: `scripts/production/recover-upgrade.sh`
- Create: `docs/operations/upgrades.md`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: current release metadata, target release manifest, backup tool, migration compatibility metadata.
- Produces: recorded `healthy`, `failed`, or `rolled_back` upgrade.

- [ ] **Step 1: Write upgrade-plan tests**

Test rejection of `latest`, missing digest, downgrade without explicit compatibility, insufficient disk, unverified pre-upgrade backup, and irreversible migration without a restore declaration.

- [ ] **Step 2: Define the release manifest**

```ts
export interface ReleaseManifest {
  version: string;
  images: Record<"api" | "worker" | "console" | "booking" | "tools", { image: string; digest: string }>;
  requiredMigration: string;
  minimumFromVersion: string;
  rollbackCompatible: boolean;
}
```

- [ ] **Step 3: Implement the fixed upgrade order**

```text
validate target manifest -> check resources/current version -> create verified backup
-> pull exact image digests -> stop application writes -> run migrations
-> start target services -> readiness -> production smoke -> record healthy
```

On failure, stop target services. If manifest says rollback compatible, restart previous pinned images. Otherwise direct the operator to `recover-upgrade.sh` using the verified backup. Never automatically restore over the only live copy.

- [ ] **Step 4: Rehearse success and failure**

Run one upgrade that passes and one image with intentionally failed readiness. Assert the failed release does not receive public traffic and previous compatible images restart. Record evidence in `docs/release-evidence/phase-5-upgrade-drill.md`.

- [ ] **Step 5: Commit**

```bash
git add scripts/production/upgrade.sh scripts/production/upgrade-plan.mjs scripts/production/upgrade-plan.test.mjs scripts/production/recover-upgrade.sh docs/operations/upgrades.md docs/release-evidence/phase-5-upgrade-drill.md .github/workflows/deploy.yml
git commit -m "feat(operations): add safe versioned upgrades"
```

### Task 6: Finish Focused Analytics and Product Polish

**Files:**
- Create: `packages/database/migrations/supabase/000028_appointment_analytics.sql`
- Modify: migration index and migration test
- Modify: analytics contracts, API, Supabase adapter, SDK, and tests
- Modify: `apps/console/app/analytics/page.tsx`
- Modify: analytics components and view tests
- Modify: `apps/console/app/globals.css`
- Modify: `apps/booking/app/globals.css`
- Modify: booking/console loading, empty, error, and mobile states
- Create/Modify: accessibility tests and browser E2E
- Create: `playwright.config.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: status/channel/service/slot/location/practitioner analytics and accessible responsive production screens.

- [ ] **Step 1: Add analytics response tests**

Extend the existing response with:

```ts
practitioner_utilization: z.array(z.object({
  staff_id: z.string().uuid(),
  display_name: z.string(),
  booked_minutes: z.number().int().nonnegative(),
  available_minutes: z.number().int().nonnegative(),
  utilization_rate: z.number().min(0).max(1),
})),
locations: z.array(z.object({ venue_id: z.string().uuid(), name: z.string(), reservations: z.number().int().nonnegative() })),
no_show_rate: z.number().min(0).max(1),
```

- [ ] **Step 2: Implement bounded authoritative queries**

Create `000028_appointment_analytics.sql` to replace the analytics RPC using booking, assignment, and operating-hours records only. Cap ranges at 366 days and results at 50 rows per breakdown. Exclude simulation unless explicitly requested. Regenerate the migration index and verify the bundle before application tests.

- [ ] **Step 3: Polish only the critical journeys**

Review and fix onboarding, login, today schedule, appointment detail/actions, public booking, management link, inbox/takeover, integration settings, system status, backup/upgrade guidance, and analytics. Every page needs keyboard focus, labels, contrast, loading, empty, partial outage, validation, conflict, and narrow-mobile behaviour.

- [ ] **Step 4: Add automated accessibility checks**

Add `@playwright/test` and `@axe-core/playwright` as root development dependencies. Add `browser:install:ci` as `playwright install --with-deps chromium` and `test:browser` as `playwright test`. Configure desktop Chromium and a 390×844 mobile viewport. Test no serious accessibility violations on login, setup, overview, booking, management, inbox, and system status. Treat keyboard-inaccessible primary actions as failures.

- [ ] **Step 5: Verify and commit**

Run analytics tests, console/booking tests and builds, browser E2E, and accessibility checks.

```bash
git add packages/database packages/contract-types packages/reservation-platform-api packages/reservations-supabase packages/sdk apps/console apps/booking tests
git commit -m "feat(product): polish operations and appointment analytics"
```

### Task 7: Add Sanitized Support Bundles and Operations Documentation

**Files:**
- Create: `scripts/production/support-bundle.sh`
- Create: `scripts/production/support-bundle.test.mjs`
- Create: `docs/operations/system-status.md`
- Create: `docs/operations/troubleshooting.md`
- Modify: `docs/operations/backend-deployment.md`

**Interfaces:**
- Produces: bounded `.tar.gz` support bundle without secret/customer content.

- [ ] **Step 1: Write fixture-based exclusion tests**

Build a fixture containing fake authorization header, API key, QR, cookie, customer email, message body, and safe version/error metadata. Assert the generated bundle contains only versions, Compose status, migration version, disk summary, sanitized health, queue counts, and safe recent error codes.

- [ ] **Step 2: Implement bounded collection**

Collect no more than 500 recent structured log entries, remove all non-allowlisted fields, include `docker compose ps` without environment, and write mode `0600`. Never call `docker inspect` without filtering because it exposes environment/secrets.

- [ ] **Step 3: Write task-oriented runbooks**

Document: interpret status, reconnect WhatsApp, rotate AI/email credentials, retry failed notifications, handle low disk, create/verify/restore backup, recover upgrade, generate support bundle, and revoke a compromised session/provider key.

- [ ] **Step 4: Verify and commit**

Run support-bundle tests and final-security verification.

```bash
git add scripts/production/support-bundle.sh scripts/production/support-bundle.test.mjs docs/operations
git commit -m "docs: add production operations and support workflow"
```

## Phase 5 Exit Gate

Required evidence:

- Readiness fails when database/migration/worker dependencies are unsafe.
- System Status reports actionable safe state without raw errors or secrets.
- Persistent route limits return correct `429` and `Retry-After` responses.
- Logs and support bundles pass secret/QR/customer-content exclusion tests.
- Encrypted backup restores users, appointments, integration credentials, jobs, and WhatsApp state into a clean installation.
- Successful and failed-readiness upgrade drills pass.
- Critical console and booking journeys pass desktop/mobile accessibility checks.
