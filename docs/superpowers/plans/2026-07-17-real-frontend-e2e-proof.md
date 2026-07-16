# Real Frontend End-to-End Proof Execution Plan

> **For agentic workers:** Execute this checklist inline and record product defects without changing product behavior.

**Goal:** Prove the Docker customer site, Docker owner console, and an independently hosted frontend through real browser interactions backed by API and database state.

**Architecture:** A fresh Git snapshot runs under a unique Docker Compose project. Temporary Playwright scripts drive the two shipped frontends and a disposable frontend outside the checkout. Only sanitized evidence is copied into the repository; runtime files and containers are removed afterward.

**Tech Stack:** Docker Compose, pnpm 10.33.2, Playwright, TypeScript/JavaScript, PostgreSQL, packed `@reservation-platform/sdk` packages.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-17-real-frontend-e2e-proof-design.md`.
- Do not fix or refactor product code during this run.
- Use plain `pnpm`, never `corepack pnpm`.
- Preserve untracked `.superpowers/` and `tmp/`.
- Keep credentials, CSRF values, management tokens, QR payloads, and environment values out of committed evidence.
- Bind services to loopback and clean up only the uniquely named Compose project and temporary external frontend.
- A rendered page alone is not a pass: durable changes require API or database verification.

---

### Task 1: Create the isolated installation and evidence workspace

**Files:**
- Create: `docs/consumer-audit/2026-07-17/frontend-proof/results.json`
- Create temporarily: `/private/tmp/reservation-real-frontend-proof-2026-07-17/source/`

- [ ] Archive committed `HEAD` into the temporary source directory so uncommitted files cannot influence the run.
- [ ] Start the stack with `docker compose --project-name reservation-real-frontend-proof up --build -d`.
- [ ] Wait for PostgreSQL, PostgREST, API, booking, console, and worker health checks.
- [ ] Record container/image health without copying environment values into evidence.

### Task 2: Exercise the customer booking product

**Files:**
- Create temporarily: `/private/tmp/reservation-real-frontend-proof-2026-07-17/tests/customer-proof.spec.ts`
- Create: `docs/consumer-audit/2026-07-17/frontend-proof/screenshots/customer-*.png`

- [ ] Open the published appointment experience in the real booking frontend.
- [ ] Select a service, future date, available slot, resource, and non-sensitive audit customer details through visible controls.
- [ ] Confirm the reservation and capture the confirmation page.
- [ ] Open its capability-protected management page, cancel through the UI, and capture the result without exposing the URL token.
- [ ] Query internal PostgreSQL by reservation ID and verify customer fields and final status.

### Task 3: Exercise the owner console product

**Files:**
- Create temporarily: `/private/tmp/reservation-real-frontend-proof-2026-07-17/tests/owner-proof.spec.ts`
- Create: `docs/consumer-audit/2026-07-17/frontend-proof/screenshots/owner-*.png`

- [ ] Authenticate with the seeded local owner fixture and visit overview, reservations, Studio, staff, settings, channels, inbox, analytics, and system status.
- [ ] Create an appointment through the console and verify it by API or PostgreSQL.
- [ ] Exercise Studio edits/publish validation, staff invitation, WhatsApp simulation, and inbox takeover/reply/resume where visible controls permit.
- [ ] Record missing external AI, SMTP, phone, or encryption dependencies as configuration blocks, not passes.
- [ ] Capture a sanitized screenshot for each major product surface and any visible defect.

### Task 4: Prove an external frontend can consume the packed SDK

**Files:**
- Create temporarily: `/private/tmp/reservation-real-frontend-proof-2026-07-17/external-frontend/`
- Create: `docs/consumer-audit/2026-07-17/frontend-proof/screenshots/external-*.png`

- [ ] Run `pnpm pack` for the public SDK and its public contract dependency.
- [ ] Create a small frontend outside the Git checkout whose server imports only installed tarballs and calls the loopback API through the SDK.
- [ ] Render the public catalog and availability in a browser, submit a real reservation from visible form controls, and render its confirmation/management link.
- [ ] Verify the created reservation in PostgreSQL and record any package-install workaround.
- [ ] Confirm the disposable frontend has no imports from monorepo source paths or database packages.

### Task 5: Assemble and validate proof

**Files:**
- Create: `docs/consumer-audit/2026-07-17/frontend-proof/README.md`
- Complete: `docs/consumer-audit/2026-07-17/frontend-proof/results.json`

- [ ] Classify every journey as pass, product failure, configuration block, or not tested.
- [ ] Link sanitized screenshots and include API/database verification without secret-bearing payloads.
- [ ] Run `pnpm run test` for any existing E2E suite used during the proof and record its exact result.
- [ ] Run `git diff --check` and inspect every evidence file for tokens, credentials, QR data, and raw environment values.
- [ ] Stop and remove only `reservation-real-frontend-proof` containers, network, volumes, and the temporary frontend directory.
- [ ] Commit the evidence separately from this plan.
