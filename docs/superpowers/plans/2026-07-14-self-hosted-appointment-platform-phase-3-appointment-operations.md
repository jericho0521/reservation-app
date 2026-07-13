# Phase 3: Appointment Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a complete appointment day: customer booking and management, practitioner-aware availability, staff lifecycle actions, email confirmations/reminders, and restart-safe jobs.

**Architecture:** Represent each practitioner with a staff profile linked to an assigned reservable resource so the existing conflict engine remains authoritative. Extend services with appointment timing/display fields, add managed rescheduling, enqueue notification intents transactionally, and let the separate worker claim leased jobs from PostgreSQL.

**Tech Stack:** PostgreSQL RPCs, reservations-core, reservations-supabase, platform API, Next.js booking/console apps, SMTP through Nodemailer, AES-256-GCM, and Node test runner.

## Global Constraints

- Follow the master plan interfaces for `PlatformJobRepository`, integration settings, and secret envelopes.
- Appointment writes remain atomic and idempotent under concurrent requests.
- A committed appointment is not rolled back because notification delivery fails.
- Customer management tokens remain opaque, hashed, scoped to public slug, and expiry checked.

---

### Task 1: Add Appointment Staff and Timing Persistence

**Files:**
- Create: `packages/database/migrations/supabase/000022_appointment_operations.sql`
- Modify: `packages/database/migrations/supabase/migration-index.json`
- Modify: `packages/database/src/supabase-migrations.test.ts`
- Create: `packages/reservations-supabase/src/staff.ts`
- Create: `packages/reservations-supabase/src/staff.test.ts`
- Modify: `packages/reservations-supabase/src/index.ts`

**Interfaces:**
- Consumes: users, venues, services, reservable resources, bookings.
- Produces: `StaffRepository` with profile/location/service assignments and practitioner resource binding.

- [ ] **Step 1: Extend the ordered migration test through `000022`**

Append `000022_appointment_operations.sql` to the exact expected core filenames and run `pnpm --dir packages/database run test`.

Expected: FAIL until the migration and regenerated index exist.

- [ ] **Step 2: Add appointment-specific columns and profiles**

```sql
alter table public.services
  add column if not exists duration_minutes integer not null default 60 check (duration_minutes > 0),
  add column if not exists buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  add column if not exists buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  add column if not exists display_price numeric(12,2) check (display_price is null or display_price >= 0),
  add column if not exists currency text check (currency is null or currency ~ '^[A-Z]{3}$');

create table public.platform_staff_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id),
  user_id uuid references public.platform_users(id) on delete set null,
  display_name text not null,
  reservable_resource_id uuid not null unique references public.reservable_resources(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_staff_locations (
  staff_id uuid not null references public.platform_staff_profiles(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  primary key (staff_id, venue_id)
);

create table public.platform_staff_services (
  staff_id uuid not null references public.platform_staff_profiles(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (staff_id, service_id)
);

alter table public.bookings
  add column if not exists staff_id uuid references public.platform_staff_profiles(id) on delete restrict,
  add column if not exists channel text not null default 'web_booking'
    check (channel in ('web_booking', 'web_chat', 'whatsapp', 'staff', 'simulation'));

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show'));
```

Add tenant/location consistency triggers so a staff profile cannot be assigned across tenants.

- [ ] **Step 3: Implement and test the adapter**

```ts
export interface StaffRepository {
  list(tenantId: string, venueId?: string): Promise<readonly StaffProfile[]>;
  create(input: CreateStaffProfile): Promise<StaffProfile>;
  update(staffId: string, input: UpdateStaffProfile): Promise<StaffProfile | undefined>;
  assignLocations(staffId: string, venueIds: readonly string[]): Promise<void>;
  assignServices(staffId: string, serviceIds: readonly string[]): Promise<void>;
}
```

Creation must atomically create the assigned `reservable_resources` row with capacity `1`, `resource_kind='custom'`, and a metadata link to the staff profile.

- [ ] **Step 4: Regenerate, verify, and commit**

Run:

```bash
pnpm run database:migration-index:generate
pnpm --dir packages/database run test
pnpm --dir packages/reservations-supabase run test
pnpm run database:verify-migration-bundle
```

Expected: all pass and the core plan ends at `000022`.

```bash
git add packages/database packages/reservations-supabase/src/staff.ts packages/reservations-supabase/src/staff.test.ts packages/reservations-supabase/src/index.ts
git commit -m "feat(appointments): add practitioner and timing persistence"
```

### Task 2: Make Availability and Reservation Creation Practitioner-Aware

**Files:**
- Modify: `packages/reservations-core/src/types.ts`
- Modify: `packages/reservations-core/src/availability.ts`
- Modify: `packages/reservations-core/src/conflicts.ts`
- Modify: `packages/reservations-core/src/reservation-engine.test.ts`
- Create: `packages/database/migrations/supabase/000023_appointment_availability_management.sql`
- Modify: `packages/database/migrations/supabase/migration-index.json`
- Modify: `packages/database/src/supabase-migrations.test.ts`
- Modify: `packages/reservations-supabase/src/index.ts`
- Modify: `packages/reservations-supabase/src/index.test.ts`
- Modify: `packages/reservation-platform-api/src/availability.ts`
- Modify: `packages/reservation-platform-api/src/availability.test.ts`

**Interfaces:**
- Produces: availability slots with optional `staff_id` and atomic creation that rejects any overlapping buffered interval for the selected practitioner.

- [ ] **Step 1: Write overlapping-buffer tests**

```ts
test("staff buffer blocks an otherwise adjacent appointment", async () => {
  const existing = appointment({ staffId: "staff-1", start: "10:00", end: "10:30" });
  const requested = appointment({ staffId: "staff-1", start: "10:35", end: "11:05", bufferBeforeMinutes: 10 });
  assert.equal(hasAppointmentConflict(requested, [existing]), true);
});

test("the same interval remains available for another practitioner", async () => {
  const slots = await generateAvailability(fixture({ bookedStaffId: "staff-1", requestedStaffId: "staff-2" }));
  assert.equal(slots.some((slot) => slot.start === "10:00"), true);
});
```

- [ ] **Step 2: Run core and API tests**

Run:

```bash
pnpm --dir packages/reservations-core run test
pnpm --dir packages/reservation-platform-api exec node --import tsx --test src/availability.test.ts
```

Expected: FAIL because buffered staff intervals are not modeled.

- [ ] **Step 3: Extend the domain inputs without appointment-only branching elsewhere**

```ts
export interface ReservationTimeSlot {
  date: string;
  startTime: string;
  endTime: string;
  staffId?: string;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
}
```

Normalize each slot to an occupied interval of `start - bufferBefore` through `end + bufferAfter`. A conflict exists when intervals overlap and the same assigned resource/practitioner is requested.

- [ ] **Step 4: Add a forward-only overlap and management migration**

In `000023_appointment_availability_management.sql`, replace `create_reservation_atomic` with a version that requires `staff_id` for appointment services, validates its service/location assignment, locks the staff resource, and rejects when:

```sql
existing.booking_date = p_booking_date
and existing.status in ('pending', 'confirmed')
and existing.staff_id = p_staff_id
and (existing.start_time - make_interval(mins => service.buffer_before_minutes))
      < (p_end_time + make_interval(mins => service.buffer_after_minutes))
and (existing.end_time + make_interval(mins => service.buffer_after_minutes))
      > (p_start_time - make_interval(mins => service.buffer_before_minutes))
```

Return the existing `conflict` platform error shape and no partial booking.

The same migration creates `reschedule_managed_reservation` so it validates token, slug, expiry, reschedule cutoff, service duration, staff assignment, and buffered availability in one transaction. Task 3 exposes this already-migrated RPC; it must not edit `000023`.

- [ ] **Step 5: Verify and commit**

Regenerate the migration index, then run package tests plus a database integration test that submits the same practitioner/time concurrently and asserts one success and one conflict.

```bash
git add packages/reservations-core packages/database packages/reservations-supabase/src packages/reservation-platform-api/src/availability.ts packages/reservation-platform-api/src/availability.test.ts
git commit -m "feat(appointments): enforce practitioner-aware availability"
```

### Task 3: Add Appointment Contracts, Public Journey, and Managed Rescheduling

**Files:**
- Modify: `packages/contract-types/src/schemas.ts`
- Modify: `packages/contract-types/src/schemas.test.ts`
- Regenerate: `packages/contract-types/contracts/`
- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/src/index.test.ts`
- Modify: `packages/reservation-platform-api/src/reservation-management.ts`
- Modify: `packages/reservation-platform-api/src/reservation-management.test.ts`
- Modify: `packages/reservations-supabase/src/reservation-management.ts`
- Modify: `packages/reservations-supabase/src/reservation-management.test.ts`
- Consume: `packages/database/migrations/supabase/000023_appointment_availability_management.sql`
- Modify: `apps/booking/components/public-booking-journey.tsx`
- Modify: `apps/booking/lib/reservation-management.ts`
- Modify: `apps/booking/lib/reservation-management.test.ts`
- Modify: `apps/booking/app/[slug]/manage/[token]/page.tsx`

**Interfaces:**
- Produces: location/practitioner fields on public booking and `POST /public/experiences/:slug/manage/:token/reschedule`.

- [ ] **Step 1: Add failing schema and management tests**

```ts
export const rescheduleManagedReservationInputSchema = z.object({
  date: isoDateSchema,
  start_time: timeSchema,
  staff_id: z.string().uuid(),
});

test("managed reschedule rejects a time inside the configured cutoff", async () => {
  const result = await rescheduleManagedReservation({ repository, publicSlug, token, input, now });
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, "conflict");
});
```

- [ ] **Step 2: Run affected tests**

Run contract, reservation-management, SDK, and booking tests.

Expected: FAIL for missing reschedule contract and repository method.

- [ ] **Step 3: Implement atomic managed reschedule**

Add `RESCHEDULE_MANAGED_RESERVATION_RPC` and extend the repository:

```ts
reschedule(input: {
  publicSlug: string;
  tokenHash: string;
  date: string;
  startTime: string;
  staffId: string;
}): Promise<ReservationManagementRepositoryResult>;
```

The existing `000023` RPC validates token, slug, expiry, business reschedule cutoff, service duration, staff assignment, and availability in one transaction. It writes an audit event with actor type `customer_management_link`.

- [ ] **Step 4: Build the customer flow**

The public journey order is fixed: location → service → practitioner or “any available” → date/slot → details → summary → explicit confirm. The management page shows reservation details and permitted reschedule/cancel actions; stale availability returns the customer to slot selection with an accessible conflict message.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm --dir packages/contract-types run contracts:generate
pnpm --dir packages/contract-types run test
pnpm --dir packages/reservation-platform-api run test
pnpm --dir packages/reservations-supabase run test
pnpm --dir packages/sdk run test
pnpm --dir apps/booking run test
pnpm --dir apps/booking run build
```

Expected: all pass.

```bash
git add packages/contract-types packages/sdk/src packages/reservation-platform-api/src/reservation-management* packages/reservations-supabase/src/reservation-management* apps/booking
git commit -m "feat(booking): complete appointment management journey"
```

### Task 4: Add the Leased Job Queue and Worker Composition

**Files:**
- Create: `packages/database/migrations/supabase/000024_durable_jobs_notifications.sql`
- Modify: migration index and migration test
- Create: `packages/reservation-platform-api/src/jobs.ts`
- Create: `packages/reservation-platform-api/src/jobs.test.ts`
- Create: `packages/reservations-supabase/src/jobs.ts`
- Create: `packages/reservations-supabase/src/jobs.test.ts`
- Modify: both package index files
- Modify: `apps/worker/src/runtime.ts`
- Modify: `apps/worker/src/runtime.test.ts`
- Modify: `apps/worker/src/server.ts`

**Interfaces:**
- Produces: the locked `PlatformJobRepository` and `createWorkerRuntime({ repository, handlers, workerId })`.

- [ ] **Step 1: Write lease/idempotency tests**

```ts
test("two workers cannot claim the same job lease", async () => {
  await repository.enqueue(jobInput("unique-confirmation"));
  const [a, b] = await Promise.all([
    repository.claim({ workerId: "a", limit: 1, leaseSeconds: 30 }),
    repository.claim({ workerId: "b", limit: 1, leaseSeconds: 30 }),
  ]);
  assert.equal(a.length + b.length, 1);
});

test("enqueue is idempotent by tenant and key", async () => {
  const first = await repository.enqueue(jobInput("same-key"));
  const second = await repository.enqueue(jobInput("same-key"));
  assert.equal(second.jobId, first.jobId);
});
```

- [ ] **Step 2: Add queue schema and claim RPC**

Create `platform_jobs` with kind, JSON payload, status, attempts, max attempts, available time, lease owner/time, error code, idempotency key, and timestamps. Enforce `unique (tenant_id, idempotency_key)`. Implement `claim_platform_jobs` with `for update skip locked` and one transaction.

Create `platform_notification_deliveries` keyed by booking and notification kind with provider ID, attempts, next attempt, delivered time, and final failure.

- [ ] **Step 3: Implement retry policy**

```ts
export function nextRetryAt(now: Date, attempts: number): string {
  const seconds = Math.min(3600, 2 ** Math.max(0, attempts) * 15);
  return new Date(now.getTime() + seconds * 1000).toISOString();
}
```

Retry only declared transient codes. When attempts reach `maxAttempts`, call `fail`; never leave a job leased forever.

- [ ] **Step 4: Compose the worker**

```ts
export type PlatformJobHandler = (job: PlatformJob) => Promise<void>;

export function createWorkerRuntime(input: {
  repository: PlatformJobRepository;
  handlers: Readonly<Partial<Record<PlatformJobKind, PlatformJobHandler>>>;
  workerId: string;
  signal: AbortSignal;
}) { /* claim, dispatch, complete/retry/fail using the fixed policy */ }
```

An unknown kind is terminally failed with `unsupported_job_kind`; it is not silently dropped.

- [ ] **Step 5: Regenerate, verify, and commit**

Run database, API package, Supabase adapter, and worker tests. Regenerate the index and verify the migration bundle.

```bash
git add packages/database packages/reservation-platform-api/src/jobs* packages/reservation-platform-api/src/index.ts packages/reservations-supabase/src/jobs* packages/reservations-supabase/src/index.ts apps/worker/src
git commit -m "feat(worker): add durable leased job processing"
```

### Task 5: Add Generic Encrypted Integration Settings

**Files:**
- Create: `packages/database/migrations/supabase/000025_integration_secrets.sql`
- Modify: migration index and migration test
- Create: `packages/platform-config/src/secret-envelope.ts`
- Create: `packages/platform-config/src/secret-envelope.test.ts`
- Modify: `packages/platform-config/src/index.ts`
- Create: `packages/reservation-platform-api/src/integrations.ts`
- Create: `packages/reservation-platform-api/src/integrations.test.ts`
- Create: `packages/reservations-supabase/src/integrations.ts`
- Create: `packages/reservations-supabase/src/integrations.test.ts`
- Modify: package index files

**Interfaces:**
- Produces: locked `SecretEnvelopeV1` and `IntegrationSettingsRepository`.

- [ ] **Step 1: Write crypto and redaction tests**

```ts
test("secret envelope round-trips and uses a fresh IV", () => {
  const first = encryptSecretEnvelope({ apiKey: "secret" }, key);
  const second = encryptSecretEnvelope({ apiKey: "secret" }, key);
  assert.notEqual(first.iv, second.iv);
  assert.deepEqual(decryptSecretEnvelope(first, key), { apiKey: "secret" });
});

test("settings response never exposes the envelope", async () => {
  const result = await readIntegrationSettings({ principal: owner, kind: "email", repository });
  assert.equal("ciphertext" in result, false);
  assert.equal(result.credentialPresent, true);
});
```

- [ ] **Step 2: Implement the envelope**

Derive a 32-byte key from the supplied high-entropy installation key with SHA-256, use a fresh 12-byte IV, AES-256-GCM, and base64url fields. Validate `v`, `alg`, IV length, tag length, and ciphertext before decrypting. Authentication failure returns a typed `SecretDecryptionError` with no sensitive detail.

- [ ] **Step 3: Add integration tables**

Create one settings row per tenant/kind and one encrypted secret row per tenant/kind. Store envelope fields as JSONB with a check for `v=1` and `alg='aes-256-gcm'`. Revoke access from public roles and grant only service role.

- [ ] **Step 4: Implement safe service responses**

Owner-only save validates `publicConfig`, encrypts credentials before repository persistence, and returns only `credentialPresent`, provider, enabled, safe public config, and timestamps. Delete/rotate operations create audit records.

- [ ] **Step 5: Verify and commit**

Run platform-config, platform API, Supabase adapter, database, and migration-bundle tests.

```bash
git add packages/database packages/platform-config/src packages/reservation-platform-api/src/integrations* packages/reservation-platform-api/src/index.ts packages/reservations-supabase/src/integrations* packages/reservations-supabase/src/index.ts
git commit -m "feat(config): store integration credentials securely"
```

### Task 6: Deliver Email Confirmations and Reminders Through Durable Jobs

**Files:**
- Create: `packages/reservation-platform-api/src/notifications.ts`
- Create: `packages/reservation-platform-api/src/notifications.test.ts`
- Modify: reservation creation/reschedule/cancel services and tests
- Create: `apps/worker/src/email.ts`
- Create: `apps/worker/src/email.test.ts`
- Modify: `apps/worker/src/server.ts`
- Modify: `apps/worker/package.json`
- Modify: `apps/console/app/setup/channels/page.tsx`
- Create: `apps/console/app/settings/email/page.tsx`
- Modify: contracts, SDK, API routes/runtime, and generated artifacts

**Interfaces:**
- Consumes: `notification.email` jobs and email integration settings.
- Produces: SMTP test/save API and confirmation, reschedule, cancellation, and reminder delivery.

- [ ] **Step 1: Write notification intent tests**

```ts
test("confirmed appointment enqueues confirmation and one reminder", async () => {
  await enqueueAppointmentNotifications({ appointment, jobs, reminderMinutes: 1440 });
  assert.deepEqual(jobs.kinds(), ["notification.email", "notification.email"]);
  assert.equal(jobs.at(0).idempotencyKey, `booking:${appointment.reservation_id}:confirmation`);
});
```

Test reschedule supersedes old reminder jobs, cancellation suppresses future reminders, and retry exhaustion leaves the appointment committed.

- [ ] **Step 2: Implement provider-neutral notification intents**

```ts
export type EmailNotificationKind =
  | "appointment_confirmed"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "appointment_reminder"
  | "staff_invitation"
  | "password_reset";
export interface EmailNotificationPayload {
  kind: EmailNotificationKind;
  reservationId: string;
  recipient: string;
  locale: string;
}
```

The job contains identifiers, not a rendered secret-bearing SMTP configuration. The worker reloads current appointment and integration data before delivery.

Once email passes its connection test, staff invitation and password-reset requests enqueue their single-use links through the same durable email path. Invitation creation stops returning the raw URL after email is enabled; reset request always remains account-enumeration safe.

- [ ] **Step 3: Implement the SMTP adapter**

Use Nodemailer in `apps/worker` only. Decrypt SMTP username/password at execution time, create the transport with a 10-second connection/socket timeout, render escaped text and HTML, and record only provider message ID and safe error code.

- [ ] **Step 4: Add owner configuration and connection test**

Support host, port, TLS mode, username, password, and from address. `POST /v1/integrations/email/test` sends a single test message to the authenticated owner's email and returns a bounded success/failure response. The API never returns SMTP credentials.

- [ ] **Step 5: Verify and commit**

Use a fake SMTP transport in automated tests. Run worker, API, SDK, console, and booking builds/tests.

```bash
git add packages/reservation-platform-api/src apps/worker apps/console packages/contract-types packages/sdk/src apps/api/src pnpm-lock.yaml
git commit -m "feat(notifications): send durable appointment email"
```

### Task 7: Finish the Staff Appointment Command Center

**Files:**
- Modify: `apps/console/app/page.tsx`
- Modify: `apps/console/app/reservations/page.tsx`
- Modify: `apps/console/app/reservations/[reservationId]/page.tsx`
- Modify: `apps/console/app/reservations/actions.ts`
- Create: `apps/console/components/reservations/appointment-calendar.tsx`
- Create: `apps/console/components/reservations/appointment-status-actions.tsx`
- Create: `apps/console/lib/appointment-view.ts`
- Create: `apps/console/lib/appointment-view.test.ts`
- Modify: API reservation mutation services, contracts, SDK, and tests

**Interfaces:**
- Produces: filtered day schedule and audited staff create/reschedule/cancel/confirm/complete/no-show operations.

- [ ] **Step 1: Write status-transition tests**

```ts
test("appointment transitions are explicit and terminal states stay terminal", () => {
  assert.equal(canTransition("pending", "confirmed"), true);
  assert.equal(canTransition("confirmed", "completed"), true);
  assert.equal(canTransition("cancelled", "confirmed"), false);
  assert.equal(canTransition("completed", "no_show"), false);
});
```

- [ ] **Step 2: Enforce the booking status contract**

Verify `pending` and `no_show` from `000022` are present in the contract enum. Expose a single status-transition service that validates role, current state, reason requirements, and audit details.

- [ ] **Step 3: Build the daily UI**

The main view defaults to today in the business timezone, filters by authorized location/practitioner/status, and shows pending, confirmed, completed, cancelled, and no-show states. Mutations use server actions, display stale/conflict errors, and revalidate overview, list, detail, and analytics paths.

- [ ] **Step 4: Add restart-survival E2E coverage**

Create `tests/e2e/appointment-working-day.e2e.ts`: public booking → confirmation job → staff reschedule → API restart → worker restart → reminder claim → completion. Assert the appointment, management token, audit events, and job state survive.

- [ ] **Step 5: Verify and commit**

Run all affected package tests, console/booking builds, and the database-backed working-day E2E.

```bash
git add apps/console packages/contract-types packages/reservation-platform-api packages/reservations-supabase packages/sdk apps/api tests/e2e/appointment-working-day.e2e.ts
git commit -m "feat(console): operate a complete appointment day"
```

## Phase 3 Exit Gate

Required evidence:

- Two concurrent requests cannot double-book one practitioner or buffered interval.
- Customers can book, reschedule, and cancel within policy through a management link.
- Staff can operate every appointment lifecycle state within authorized locations.
- Confirmation/reminder jobs survive API and worker restarts.
- SMTP failure is visible and retryable without losing the appointment.
- Integration credentials are encrypted and absent from API responses/logs.
- The full appointment working-day E2E passes.
