# Phase 6: Release Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a verifiable release and prove that a fresh non-developer operator can install and run one appointment business for a complete working day.

**Architecture:** GitHub Actions builds immutable multi-container release artifacts, emits SBOM/provenance, signs images, and publishes an installer bundle. A clean-VPS harness, failure drills, browser suite, restore/upgrade rehearsals, and a human acceptance run produce versioned evidence tied to exact image digests.

**Tech Stack:** GitHub Actions, Docker Buildx, GHCR, Cosign/Sigstore, Syft or Buildx SBOM attestations, Playwright, Docker Compose, and Markdown evidence/runbooks.

## Global Constraints

- Follow every master-plan gate; Phase 6 may not waive a failed earlier requirement.
- Release evidence records observed results only and is tied to commit, version, image digests, migration version, host, and timestamp.
- Do not put live customer data, credentials, QR payloads, or backup recovery keys into evidence artifacts.
- A release candidate that cannot restore its backup or survive the full-day run is not final.

---

### Task 1: Build, Attest, Sign, and Publish Immutable Release Artifacts

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy.yml`
- Create: `scripts/production/release-manifest.mjs`
- Create: `scripts/production/release-manifest.test.mjs`
- Create: `scripts/production/verify-signatures.sh`
- Create: `release/README.md`
- Create: `release/install.sh`
- Create: `release/compose.production.yml`
- Create: `release/Caddyfile`

**Interfaces:**
- Produces: semver release bundle and signed `api`, `worker`, `console`, `booking`, and `tools` images.

- [ ] **Step 1: Write release-manifest validation tests**

```js
test("release manifest requires one digest-pinned image per production component", () => {
  const result = validateReleaseManifest({
    version: "0.2.0",
    requiredMigration: "000028",
    images: { api: { image: "ghcr.io/example/api", digest: "sha256:" + "a".repeat(64) } },
  });
  assert.deepEqual(result.errors.sort(), [
    "missing image: booking",
    "missing image: console",
    "missing image: tools",
    "missing image: worker",
  ]);
});
```

Test invalid semver, mutable tags, malformed digests, mismatched migration version, duplicate image reference, and missing rollback metadata.

- [ ] **Step 2: Define the release workflow**

Trigger only from an annotated `v*` tag after CI succeeds. Use least-privilege `contents: write`, `packages: write`, and `id-token: write`. Build each image with Buildx for `linux/amd64`, attach SBOM and provenance, push the semver tag, capture its digest, and sign the digest through keyless Cosign.

- [ ] **Step 3: Generate and publish the release bundle**

Generate `release-manifest.json` from observed build digests. Package the manifest, production Compose, Caddyfile, installer, operations quick start, checksums, and signature-verification script. `release/install.sh` delegates to the verified production installer and never substitutes a mutable tag.

- [ ] **Step 4: Replace deployment placeholders**

The deploy workflow validates a chosen published manifest and produces installation commands/evidence; it does not contain placeholder echo steps or assume a vendor-hosted deployment. Production publication requires the protected GitHub environment approval.

- [ ] **Step 5: Verify locally and in CI**

Run manifest tests and feed one deliberately unsigned image to `verify-signatures.sh`; expect failure. Feed the release candidate digests; expect every signature and attestation verification to pass.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows scripts/production/release-manifest.mjs scripts/production/release-manifest.test.mjs scripts/production/verify-signatures.sh release
git commit -m "ci: publish signed production releases"
```

### Task 2: Automate Clean-Ubuntu Installation Proof

**Files:**
- Create: `tests/production/clean-install.test.mjs`
- Create: `tests/production/remote-host.mjs`
- Create: `scripts/production/verify-clean-install.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: disposable Ubuntu host connection details and release manifest.
- Produces: machine-readable clean-install result without credentials.

- [ ] **Step 1: Write the orchestration-state test**

```js
test("clean install proof stops after a failed readiness gate", async () => {
  const calls = [];
  const result = await verifyCleanInstall(fixture({ readiness: false, calls }));
  assert.equal(result.status, "failed");
  assert.deepEqual(calls, ["preflight", "install", "readiness"]);
});
```

Also test missing DNS, public database exposure, automatic demo seed, mutable image, and secret leakage in captured output.

- [ ] **Step 2: Implement the fixed remote sequence**

```text
verify Ubuntu release and empty target directory
-> verify release signatures
-> run installer
-> wait for HTTPS/readiness
-> assert only ports 22/80/443 are public
-> create first owner through setup API
-> assert setup token cannot be reused
-> assert no demo slug/data
-> configure minimal appointment business
-> publish and complete one public booking
```

Remote commands must stream through a redactor before storage. Do not accept passwords on command lines; use protected stdin/files.

- [ ] **Step 3: Add the explicit root command**

```json
{
  "scripts": {
    "production:proof:clean-install": "node scripts/production/verify-clean-install.mjs"
  }
}
```

The command is skipped with a clear reason when the required disposable-host configuration is absent; release CI must run it in strict mode.

- [ ] **Step 4: Verify and commit**

Run unit orchestration tests locally and one strict proof against a disposable Ubuntu VPS. Save the redacted JSON result and human summary under `docs/release-evidence/0.2.0/clean-install/`.

```bash
git add tests/production scripts/production/verify-clean-install.mjs package.json .github/workflows/release.yml docs/release-evidence
git commit -m "test: prove clean production installation"
```

### Task 3: Run Failure, Concurrency, Security, and Recovery Drills

**Files:**
- Create: `tests/production/failure-drills.test.mjs`
- Create: `tests/production/concurrency.test.mjs`
- Create: `tests/production/security-boundaries.test.mjs`
- Create: `tests/production/recovery-drills.test.mjs`
- Create: `scripts/production/run-release-drills.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: one strict `production:proof:drills` gate.

- [ ] **Step 1: Define the exact failure matrix as executable cases**

```ts
const drills = [
  "restart-api-with-active-session",
  "restart-worker-with-leased-job",
  "disable-ai-provider",
  "disconnect-whatsapp",
  "reject-smtp-delivery",
  "stop-database",
  "simulate-low-disk",
  "submit-stale-slot",
  "submit-duplicate-idempotency-key",
  "fail-target-upgrade-readiness",
] as const;
```

Each case defines setup, mutation, expected degraded behaviour, recovery, and data-integrity assertions.

- [ ] **Step 2: Add the concurrency proof**

Submit at least 50 concurrent confirmations for the same practitioner/slot using unique request correlation IDs and controlled duplicate idempotency keys. Assert exactly one reservation for unique competing requests, identical response for the repeated idempotency key, no duplicate notification, and no stuck proposal claim.

- [ ] **Step 3: Add security-boundary proof**

Verify anonymous/owner/staff/service identities against setup, auth, owner settings, staff assignments, public booking, management links, conversations, system status, backups, and support bundle routes. Verify CSRF, exact CORS, cookie flags, rate limits, body limits, timeout, secret redaction, QR no-store, and private database/PostgREST networking.

- [ ] **Step 4: Add backup/upgrade recovery proof**

Run verified backup → clean restore and healthy upgrade → failed-readiness recovery on the same release candidate. Compare selected record counts and stable identifiers before/after without exporting personal content into evidence.

- [ ] **Step 5: Verify and commit**

Run `pnpm run production:proof:drills` in strict mode and save the redacted report under the release version.

```bash
git add tests/production scripts/production/run-release-drills.mjs package.json docs/release-evidence
git commit -m "test: add production failure and recovery drills"
```

### Task 4: Complete Browser, Mobile, and Accessibility Release Proof

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/browser/setup-auth.spec.ts`
- Create: `tests/browser/public-booking.spec.ts`
- Create: `tests/browser/appointment-operations.spec.ts`
- Create: `tests/browser/ai-whatsapp-settings.spec.ts`
- Create: `tests/browser/unified-inbox.spec.ts`
- Create: `tests/browser/system-recovery.spec.ts`
- Create: `tests/browser/accessibility.spec.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: one reproducible Chromium release journey with screenshots/traces only on failure.

- [ ] **Step 1: Implement deterministic fixtures**

Create each business through setup APIs in an isolated database schema/run identifier. Fixtures use appointment-specific data and simulation adapters for CI; the live WhatsApp proof remains a separate manual evidence step.

- [ ] **Step 2: Cover the critical journeys**

Test setup token → owner → business/location/service/practitioner/hours/email → publish; login/logout/invitation; public booking and manage; staff reschedule/status; AI save/test; WhatsApp pairing states; inbox/takeover/resume; system status and failed-job retry.

- [ ] **Step 3: Cover mobile and accessibility**

Run each customer journey at 390×844 and primary console journeys at desktop plus tablet width. Use `@axe-core/playwright`, keyboard-only navigation, focus visibility, error announcement, label association, and contrast checks. No serious/critical Axe violation is allowed.

- [ ] **Step 4: Add CI browser setup using a real script**

Run `pnpm run browser:install:ci`, start the production-profile test stack, run `pnpm run test:browser`, and upload failure-only traces/screenshots. The workflow-script checker must prove both scripts exist.

- [ ] **Step 5: Verify and commit**

```bash
git add playwright.config.ts tests/browser .github/workflows/ci.yml
git commit -m "test: prove critical browser and accessibility journeys"
```

### Task 5: Finish Operator, Owner, Staff, and Recovery Documentation

**Files:**
- Create: `docs/tutorials/production-first-run.md`
- Create: `docs/how-to/owner-onboarding.md`
- Create: `docs/how-to/staff-working-day.md`
- Create: `docs/how-to/connect-ai.md`
- Create: `docs/how-to/connect-whatsapp.md`
- Create: `docs/how-to/recover-installation.md`
- Create: `docs/reference/production-configuration.md`
- Create: `docs/reference/release-compatibility.md`
- Modify: root `README.md`
- Modify: `docs/manuals/backend-modules-dev-user-manual.html`

**Interfaces:**
- Produces: documentation used verbatim by the fresh operator in Task 6.

- [ ] **Step 1: Separate the four documentation purposes**

The first-run file is a tutorial; owner/staff/connect/recover files are task how-tos; configuration and compatibility are reference; architecture and security remain explanation. Do not put manual `.env` editing into the supported first-run tutorial.

- [ ] **Step 2: Document exact supported paths**

Include Ubuntu prerequisites, DNS, installer, setup URL, owner creation, recovery-key export/verification, business configuration, email, optional AI/WhatsApp, publication, daily operations, status, backup verification, upgrade, and support bundle.

- [ ] **Step 3: Document expected failures safely**

For each command, state success output and safe diagnosis for DNS/TLS, image signature, migration, database, worker, email, AI, WhatsApp, low disk, backup, restore, and upgrade. Never instruct users to print or paste credentials/QR payloads into logs or tickets.

- [ ] **Step 4: Run documentation verification**

Extend repository docs checks to validate file links, commands/scripts, route names, port exposure, migration version, release filenames, and absence of outdated fixed tenant/venue/service-key production guidance.

- [ ] **Step 5: Commit**

```bash
git add README.md docs
git commit -m "docs: publish production operator and user guides"
```

### Task 6: Conduct and Record the Full-Day Non-Developer Acceptance Run

**Files:**
- Create: `docs/release-evidence/full-day-acceptance-template.md`
- Create: `docs/release-evidence/0.2.0/full-day-acceptance.md`
- Create: `docs/release-evidence/0.2.0/acceptance-summary.json`
- Create: `scripts/production/validate-acceptance-evidence.mjs`
- Create: `scripts/production/validate-acceptance-evidence.test.mjs`

**Interfaces:**
- Produces: the final human acceptance gate tied to the release candidate.

- [ ] **Step 1: Write evidence-schema tests**

Require release version, commit, image digests, migration version, operator role/background, start/end timestamps spanning at least eight hours, tasks completed, incidents, recovery actions, reservation/message/job count summaries, backup ID/checksum, and operator verdict. Reject secrets, email/phone patterns, bearer tokens, QR-like fields, and missing signatures.

- [ ] **Step 2: Prepare a fresh operator and installation**

The operator must not have implemented the system and receives only published documentation plus the release bundle. Start from a clean supported Ubuntu VPS and unused domain.

- [ ] **Step 3: Execute the working day**

The operator installs, creates the owner, exports the recovery key, configures one location, at least two services, two practitioners, hours, email, AI, and WhatsApp, publishes, and operates for at least eight hours. During the run they complete web, AI, and WhatsApp bookings; customer reschedule/cancel; staff create/reschedule/complete/no-show; takeover/resume; one API restart; one worker restart; one failed notification retry; and one verified backup.

- [ ] **Step 4: Record only safe evidence**

Record counts, timestamps, safe IDs/hashes, screenshots with synthetic/redacted data, operator notes, and whether documentation alone resolved each incident. Do not record live tokens, QR codes, customer contact details, message bodies, or backup keys.

- [ ] **Step 5: Validate and commit the evidence**

Run `node scripts/production/validate-acceptance-evidence.mjs docs/release-evidence/0.2.0/full-day-acceptance.md` and require exit `0`.

```bash
git add docs/release-evidence scripts/production/validate-acceptance-evidence.mjs scripts/production/validate-acceptance-evidence.test.mjs
git commit -m "test: record full-day production acceptance"
```

### Task 7: Freeze, Tag, and Publish the Final Release

**Files:**
- Create: `docs/release-evidence/0.2.0/release-checklist.md`
- Create: `CHANGELOG.md` or modify it if present
- Modify: package versions only where the repository release policy requires

**Interfaces:**
- Produces: final annotated tag and published signed release.

- [ ] **Step 1: Run the complete release gate from a clean checkout**

```bash
pnpm install --frozen-lockfile
pnpm run ci:verify
pnpm run test:browser
pnpm run production:verify
pnpm run production:proof:clean-install
pnpm run production:proof:drills
```

Expected: every strict gate passes on the exact commit to be tagged.

- [ ] **Step 2: Verify manual evidence**

Require clean install, restore drill, upgrade drill, live Baileys pairing/reconnect, live AI provider test, SMTP delivery test, and full-day acceptance. Each evidence record must match the release candidate commit/image digests.

- [ ] **Step 3: Freeze changes and write release notes**

List product behaviour, supported platform, installation path, migration version, backup/restore requirement, known limitations, deferred features, and exact verification evidence. Do not describe the local demo stack as production.

- [ ] **Step 4: Create the annotated tag and allow release workflow publication**

Use the approved semantic version from the manifest. After publication, independently verify bundle checksums, image signatures, public documentation links, and a clean install using only published assets.

- [ ] **Step 5: Record publication result**

Commit the final release checklist if post-publication evidence is maintained in the repository; otherwise attach it to the immutable release artifact and link it from the repository.

## Phase 6 Exit Gate

The project is complete only when:

- Signed, digest-pinned production images and installer bundle are published.
- Clean Ubuntu installation proof passes from published assets.
- All package, migration, browser, accessibility, security, concurrency, failure, recovery, and upgrade gates pass.
- Live email, AI, and Baileys checks are recorded without exposing secrets.
- A fresh non-developer operator completes the eight-hour acceptance run using documentation alone.
- The verified backup from that run can restore the installation.
- Release notes accurately state supported and deferred scope.
