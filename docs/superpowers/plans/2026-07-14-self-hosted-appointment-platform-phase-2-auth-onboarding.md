# Phase 2: Authentication and Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixed console credentials and hard-coded business scope with secure owner/staff sessions and a one-time appointment-business setup wizard.

**Architecture:** A single installation row owns the internal tenant. The API stores Argon2id password hashes and SHA-256 session-token hashes, issues one secure HTTP-only cookie, resolves authorized venue scope, and records privileged audit events. The console runs at `/admin`, forwards the browser session cookie on server-side SDK calls, and guides the first owner through business publication.

**Tech Stack:** PostgreSQL, TypeScript, Zod, `@node-rs/argon2`, Node Web Crypto, Next.js server components/actions, platform SDK, and Node test runner.

## Global Constraints

- Follow the master plan constraints and locked `AuthenticatedPrincipal` interface.
- The setup token is single-use, short-lived, and cannot authorize normal API operations.
- Passwords, setup tokens, invitation tokens, reset tokens, and session tokens are never stored in plaintext.
- Client-provided tenant/venue headers may narrow an already authorized scope but may not grant scope.

---

### Task 1: Add Installation, User, Session, and Audit Storage

**Files:**
- Create: `packages/database/migrations/supabase/000021_installation_auth.sql`
- Modify: `packages/database/migrations/supabase/migration-index.json`
- Modify: `packages/database/src/supabase-migrations.test.ts`
- Create: `packages/reservations-supabase/src/installation.ts`
- Create: `packages/reservations-supabase/src/installation.test.ts`
- Create: `packages/reservations-supabase/src/sessions.ts`
- Create: `packages/reservations-supabase/src/sessions.test.ts`
- Modify: `packages/reservations-supabase/src/index.ts`
- Create: `scripts/production/bootstrap-installation.mjs`
- Create: `scripts/production/bootstrap-installation.test.mjs`
- Modify: `compose.production.yml`

**Interfaces:**
- Produces: `InstallationRepository`, `PlatformSessionRepository`, and `AuditRepository` adapters consumed by API services.

- [ ] **Step 1: Extend the migration-order test before adding SQL**

```ts
assert.deepEqual(
  plan.migrations.map((entry) => entry.path.split("/").at(-1)),
  [
    "000001_extensions.sql",
    "000002_platform_tenant_auth.sql",
    "000003_reservation_catalog.sql",
    "000004_reservation_resources.sql",
    "000005_reservation_bookings.sql",
    "000006_resource_maintenance.sql",
    "000007_availability_rules.sql",
    "000008_atomic_reservation_rpc.sql",
    "000009_core_rls_policies.sql",
    "000010_core_security_hardening.sql",
    "000011_platform_idempotency.sql",
    "000012_whatsapp_business_agent.sql",
    "000013_whatsapp_staff_takeover.sql",
    "000014_availability_snapshot_rpc.sql",
    "000015_experience_studio_foundation.sql",
    "000016_experience_availability_rules.sql",
    "000017_experience_knowledge.sql",
    "000018_reservation_management_tokens.sql",
    "000019_unified_conversations.sql",
    "000020_operations_analytics_rpc.sql",
    "000021_installation_auth.sql",
  ],
);
```

- [ ] **Step 2: Run the database test**

Run: `pnpm --dir packages/database run test`

Expected: FAIL because `000021` is absent.

- [ ] **Step 3: Add the forward-only schema**

Create these tables with UUID primary keys, timestamps, foreign keys, and restrictive grants:

```sql
create table public.platform_installation (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  tenant_id text not null references public.tenants(id),
  domain text not null,
  setup_token_hash text,
  setup_expires_at timestamptz,
  setup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id),
  email text not null,
  display_name text not null,
  password_hash text not null,
  role text not null check (role in ('owner', 'staff')),
  status text not null default 'active' check (status in ('invited', 'active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index platform_users_tenant_email_key
  on public.platform_users (tenant_id, lower(email));

create table public.platform_user_venue_assignments (
  user_id uuid not null references public.platform_users(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  primary key (user_id, venue_id)
);

create table public.platform_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.platform_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.platform_auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.platform_users(id) on delete cascade,
  purpose text not null check (purpose in ('invitation', 'password_reset')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.platform_audit_events (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.tenants(id),
  venue_id uuid references public.venues(id),
  actor_user_id uuid references public.platform_users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_value jsonb,
  after_value jsonb,
  reason text,
  correlation_id text,
  created_at timestamptz not null default now()
);
```

Revoke table access from `anon` and `authenticated`; grant required operations only to `service_role`.

- [ ] **Step 4: Implement typed Supabase adapters**

Expose exact methods:

```ts
export interface PlatformSessionRepository {
  readInstallation(): Promise<InstallationRecord | undefined>;
  consumeSetupToken(input: { tokenHash: string; now: string }): Promise<InstallationRecord | undefined>;
  createUser(input: NewPlatformUser): Promise<PlatformUserRecord>;
  findUserByEmail(tenantId: string, email: string): Promise<PlatformUserRecord | undefined>;
  createSession(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<void>;
  readSession(tokenHash: string, now: string): Promise<AuthenticatedPrincipal | undefined>;
  revokeSession(tokenHash: string, now: string): Promise<void>;
}
```

Repository tests must prove tenant-scoped email normalization, disabled-user rejection, expired/revoked-session rejection, and venue assignment mapping.

- [ ] **Step 5: Bootstrap the installation row after migrations**

`bootstrap-installation.mjs` reads the generated domain, installation/tenant identifier, and setup token from protected files; hashes the setup token with SHA-256; inserts the internal tenant and singleton installation in one transaction; and is idempotent only when the existing installation identity/domain match. It never writes or prints the plaintext token. Add `reservation-bootstrap` to production Compose after migrations and before API readiness.

Test first insertion, identical restart, mismatched-domain rejection, expired setup timestamp, and output redaction.

- [ ] **Step 6: Regenerate and verify**

Run:

```bash
pnpm run database:migration-index:generate
pnpm --dir packages/database run test
pnpm --dir packages/reservations-supabase run test
pnpm run database:verify-migration-bundle
node --test scripts/production/bootstrap-installation.test.mjs
```

Expected: all commands pass and the core plan ends at `000021`.

- [ ] **Step 7: Commit**

```bash
git add packages/database packages/reservations-supabase/src/installation.ts packages/reservations-supabase/src/installation.test.ts packages/reservations-supabase/src/sessions.ts packages/reservations-supabase/src/sessions.test.ts packages/reservations-supabase/src/index.ts scripts/production/bootstrap-installation.mjs scripts/production/bootstrap-installation.test.mjs compose.production.yml
git commit -m "feat(auth): add installation and session persistence"
```

### Task 2: Add Framework-Neutral Setup and Session Services

**Files:**
- Create: `packages/reservation-platform-api/src/installation.ts`
- Create: `packages/reservation-platform-api/src/installation.test.ts`
- Create: `packages/reservation-platform-api/src/sessions.ts`
- Create: `packages/reservation-platform-api/src/sessions.test.ts`
- Create: `packages/reservation-platform-api/src/staff.ts`
- Create: `packages/reservation-platform-api/src/staff.test.ts`
- Modify: `packages/reservation-platform-api/src/index.ts`
- Modify: `packages/reservation-platform-api/package.json`

**Interfaces:**
- Consumes: `PlatformSessionRepository`.
- Produces: `createFirstOwner`, `loginWithPassword`, `authenticateSession`, `logoutSession`, `inviteStaff`, and `acceptStaffInvitation`.

- [ ] **Step 1: Write failing service tests**

```ts
test("first owner consumes setup token once and receives an owner session", async () => {
  const result = await createFirstOwner({
    setupToken: "a".repeat(43),
    input: { email: "owner@example.com", display_name: "Owner", password: "correct horse battery staple" },
    repositories,
    passwordHasher,
    tokenFactory: () => "s".repeat(43),
    now: new Date("2026-07-14T00:00:00Z"),
  });
  assert.equal(result.principal.role, "owner");
  assert.equal(await repositories.consumeAgain(), undefined);
});

test("staff cannot authenticate for an unassigned venue", async () => {
  const principal = { userId: "staff", tenantId: "tenant", role: "staff", venueIds: ["venue-a"] } as const;
  assert.equal(authorizeVenue(principal, "venue-b"), undefined);
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm --dir packages/reservation-platform-api exec node --import tsx --test src/installation.test.ts src/sessions.test.ts src/staff.test.ts`

Expected: FAIL because the modules are absent.

- [ ] **Step 3: Implement password and token boundaries**

```ts
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface SessionTokenResult {
  token: string;
  tokenHash: string;
  expiresAt: string;
  principal: AuthenticatedPrincipal;
}
```

Use `@node-rs/argon2` with Argon2id for passwords. Validate normalized lowercase email, a minimum 12-character password, a 32-byte base64url token, SHA-256 token hashes, a 12-hour session expiry, and constant-behaviour invalid-login responses.

- [ ] **Step 4: Implement authorization helpers**

```ts
export function authorizeVenue(principal: AuthenticatedPrincipal, requestedVenueId?: string) {
  if (principal.role === "owner") return requestedVenueId;
  if (!requestedVenueId) return principal.venueIds.length === 1 ? principal.venueIds[0] : undefined;
  return principal.venueIds.includes(requestedVenueId) ? requestedVenueId : undefined;
}

export function requireOwner(principal: AuthenticatedPrincipal) {
  if (principal.role !== "owner") throw new PlatformAuthorizationError("owner_required");
  return principal;
}
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --dir packages/reservation-platform-api run test`

Expected: all API-package tests pass.

```bash
git add packages/reservation-platform-api/src/installation.ts packages/reservation-platform-api/src/installation.test.ts packages/reservation-platform-api/src/sessions.ts packages/reservation-platform-api/src/sessions.test.ts packages/reservation-platform-api/src/staff.ts packages/reservation-platform-api/src/staff.test.ts packages/reservation-platform-api/src/index.ts packages/reservation-platform-api/package.json pnpm-lock.yaml
git commit -m "feat(auth): add setup and session services"
```

### Task 3: Add Auth Contracts, SDK Methods, Routes, and Cookies

**Files:**
- Modify: `packages/contract-types/src/schemas.ts`
- Modify: `packages/contract-types/src/schemas.test.ts`
- Regenerate: `packages/contract-types/contracts/`
- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/src/index.test.ts`
- Modify: `apps/api/src/routes.ts`
- Modify: `apps/api/src/routes.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/server.test.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/runtime.test.ts`

**Interfaces:**
- Produces: `/v1/setup/status`, `/v1/setup/owner`, login/logout/session, invitation acceptance, and password-reset request/completion routes.

- [ ] **Step 1: Add failing schema and route tests**

Define and test:

```ts
export const platformUserRoleSchema = z.enum(["owner", "staff"]);
export const createFirstOwnerInputSchema = z.object({
  setup_token: z.string().min(43).max(128),
  email: z.string().email().max(320),
  display_name: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128),
});
export const loginInputSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});
export const authenticatedSessionSchema = z.object({
  user_id: z.string().uuid(),
  tenant_id: z.string().min(1),
  role: platformUserRoleSchema,
  venue_ids: z.array(z.string().uuid()),
  expires_at: z.string().datetime(),
});
```

Route tests must assert setup is available only before completion, login returns the same generic `401` for unknown email and wrong password, staff invitation requires owner, and an unauthorized venue header returns `403`.

Add `requestPasswordReset` and `completePasswordReset` contracts. The request always returns `202` whether the account exists. Completion consumes a single-use `password_reset` token and revokes all existing sessions for that user.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm --dir packages/contract-types run test
pnpm --dir apps/api exec node --import tsx --test src/routes.test.ts src/server.test.ts
```

Expected: FAIL for missing schemas and routes.

- [ ] **Step 3: Add cookie response support**

On successful setup/login return two cookies:

```http
Set-Cookie: reservation_session=<opaque-token>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200
Set-Cookie: reservation_csrf=<opaque-csrf-token>; Path=/; Secure; SameSite=Strict; Max-Age=43200
```

On logout clear both cookies with `Max-Age=0`. Parse only the exact cookie names. Do not place the session token in JSON. For every cookie-authenticated state-changing request, require an exact allowed `Origin` and an `X-CSRF-Token` value equal to the `reservation_csrf` cookie using timing-safe comparison. Login, setup-owner, invitation acceptance, and reset completion use strict Origin validation before a session exists. Add `access-control-allow-credentials: true` only for an exact configured origin; never combine credentials with `*`.

- [ ] **Step 4: Resolve scope from the authenticated principal**

Update `StandaloneApiDependencies` with session services. For protected routes, authenticate the cookie first, derive `tenantId` from `principal.tenantId`, and accept `X-Reservation-Venue-Id` only when `authorizeVenue` allows it. Preserve service-key/JWKS authentication solely for trusted automation and compatibility, not the console's normal path.

- [ ] **Step 5: Add SDK methods and regenerate contracts**

Add:

```ts
getSetupStatus(): Promise<SetupStatusResponse>;
createFirstOwner(input: CreateFirstOwnerInput): Promise<AuthenticatedSessionResponse>;
login(input: LoginInput): Promise<AuthenticatedSessionResponse>;
logout(): Promise<void>;
getSession(): Promise<AuthenticatedSessionResponse>;
inviteStaff(input: StaffInvitationInput): Promise<StaffInvitationResponse>;
acceptStaffInvitation(token: string, input: AcceptStaffInvitationInput): Promise<AuthenticatedSessionResponse>;
requestPasswordReset(input: RequestPasswordResetInput): Promise<void>;
completePasswordReset(token: string, input: CompletePasswordResetInput): Promise<void>;
```

Auth requests use `credentials: "include"`; extend `ReservationPlatformClientOptions` with `credentials?: RequestCredentials` and pass it to fetch.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm --dir packages/contract-types run contracts:generate
pnpm --dir packages/contract-types run test
pnpm --dir packages/sdk run test
pnpm --dir apps/api run test
```

Expected: all pass.

```bash
git add packages/contract-types packages/sdk/src apps/api/src
git commit -m "feat(api): expose secure setup and session routes"
```

### Task 4: Replace Fixed Console Credentials with the Authenticated Session

**Files:**
- Modify: `apps/console/next.config.ts`
- Modify: `apps/console/lib/platform-client-config.ts`
- Modify: `apps/console/lib/platform-client-config.test.ts`
- Modify: `apps/console/lib/platform-client.ts`
- Create: `apps/console/lib/auth-session.ts`
- Create: `apps/console/lib/auth-session.test.ts`
- Create: `apps/console/app/login/page.tsx`
- Create: `apps/console/app/setup/page.tsx`
- Create: `apps/console/middleware.ts`
- Modify: `apps/console/app/layout.tsx`

**Interfaces:**
- Consumes: auth SDK routes and `reservation_session` cookie.
- Produces: `/admin/login`, `/admin/setup`, and protected console navigation.

- [ ] **Step 1: Write config and redirect tests**

```ts
test("console config requires only the internal API URL", () => {
  assert.deepEqual(readConsolePlatformConfig({ RESERVATION_PLATFORM_BASE_URL: "http://reservation-api:4100" }), {
    baseUrl: "http://reservation-api:4100",
  });
});

test("protected route redirects an anonymous request to login", () => {
  assert.equal(authRedirect({ pathname: "/admin/reservations", hasSessionCookie: false }), "/admin/login");
});
```

- [ ] **Step 2: Run console tests**

Run: `pnpm --dir apps/console run test`

Expected: FAIL because fixed API key/tenant/venue values are still required.

- [ ] **Step 3: Configure one-origin admin routing**

Set:

```ts
const nextConfig = {
  output: "standalone",
  basePath: "/admin",
};
export default nextConfig;
```

The production Caddy route remains `/admin*`; internal SDK calls use `http://reservation-api:4100` and forward the incoming `Cookie` header through `headers: () => ({ cookie })`.

- [ ] **Step 4: Implement login and setup forms**

The login form posts to `/v1/auth/login` with `credentials: include`, then redirects to `/admin`. The setup form requires the URL token, creates the first owner, removes the token from browser history with a redirect, and never stores it in local storage or client logs.

For authenticated SDK writes, the server-side console client reads `reservation_csrf` from the incoming cookies and adds `X-CSRF-Token`; the session cookie is forwarded separately in `Cookie`. Never forward the setup/invitation/reset token after its one-time operation.

Middleware protects every `/admin` route except `/admin/login` and `/admin/setup`. Server pages call `getSession`; a rejected session redirects to login.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm --dir apps/console run test
pnpm --dir apps/console run typecheck
pnpm --dir apps/console run build
```

Expected: all pass without service-key, tenant, or venue environment variables.

```bash
git add apps/console
git commit -m "feat(console): authenticate owners and staff with sessions"
```

### Task 5: Add Single-Business and Multi-Location Onboarding Services

**Files:**
- Modify: `packages/contract-types/src/schemas.ts`
- Modify: `packages/reservation-platform-api/src/installation.ts`
- Modify: `packages/reservation-platform-api/src/installation.test.ts`
- Create: `packages/reservation-platform-api/src/locations.ts`
- Create: `packages/reservation-platform-api/src/locations.test.ts`
- Modify: `packages/reservations-supabase/src/installation.ts`
- Create: `packages/reservations-supabase/src/locations.ts`
- Create: `packages/reservations-supabase/src/locations.test.ts`
- Modify: `apps/api/src/routes.ts`
- Modify: `packages/sdk/src/index.ts`

**Interfaces:**
- Produces: `GET/PUT /v1/installation/business`, `GET/POST/PATCH /v1/locations`, and appointment-preset draft creation.

- [ ] **Step 1: Write failing business/location tests**

```ts
test("first business setup creates an appointment draft and first location", async () => {
  const result = await configureInstallationBusiness({
    principal: ownerPrincipal,
    input: {
      name: "Northstar Therapy",
      public_slug: "northstar-therapy",
      timezone: "Asia/Kuala_Lumpur",
      location: { name: "City Centre", address: "1 Example Road" },
    },
    repository,
  });
  assert.equal(result.profile.preset_id, "appointments_salon");
  assert.equal(result.locations.length, 1);
});
```

Test slug uniqueness, valid IANA timezone, owner-only mutation, and staff location filtering.

- [ ] **Step 2: Run package tests and observe failure**

Run: `pnpm --dir packages/reservation-platform-api run test`

Expected: FAIL for missing location service.

- [ ] **Step 3: Implement the transaction boundary**

The repository method `configureBusiness` must atomically create or update the tenant display name, first venue, appointment business profile, draft experience configuration, default appointment terminology, availability settings, and owner venue assignment. It returns no partial result.

Use the fixed draft defaults:

```ts
const appointmentExperienceDefaults = {
  preset_id: "appointments_salon",
  terminology: { customer: "Client", resource: "Practitioner", booking: "Appointment" },
  channels: { web_booking: true, web_chat: false, whatsapp: false },
};
```

- [ ] **Step 4: Add contracts, routes, and SDK methods**

Generate schemas and typed methods for business read/update and location list/create/update. Owner mutation endpoints derive tenant ID from the session. The public slug is normalized once and checked case-insensitively.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm --dir packages/contract-types run contracts:generate
pnpm --dir packages/contract-types run test
pnpm --dir packages/reservation-platform-api run test
pnpm --dir packages/reservations-supabase run test
pnpm --dir apps/api run test
pnpm --dir packages/sdk run test
```

Expected: all pass.

```bash
git add packages/contract-types packages/reservation-platform-api/src packages/reservations-supabase/src apps/api/src packages/sdk/src
git commit -m "feat(onboarding): configure one business and its locations"
```

### Task 6: Build and Validate the Browser Onboarding Wizard

**Files:**
- Create: `apps/console/app/setup/business/page.tsx`
- Create: `apps/console/app/setup/location/page.tsx`
- Create: `apps/console/app/setup/services/page.tsx`
- Create: `apps/console/app/setup/staff/page.tsx`
- Create: `apps/console/app/setup/hours/page.tsx`
- Create: `apps/console/app/setup/channels/page.tsx`
- Create: `apps/console/app/setup/review/page.tsx`
- Create: `apps/console/components/setup/setup-progress.tsx`
- Create: `apps/console/lib/onboarding-state.ts`
- Create: `apps/console/lib/onboarding-state.test.ts`
- Modify: `apps/console/components/console-shell.tsx`
- Modify: existing studio forms only where they are reused

**Interfaces:**
- Consumes: authenticated business/location APIs and existing appointment service, resource, hours, channel, validation, and publish APIs.
- Produces: a resumable first-run journey ending in an explicitly published appointment experience.

- [ ] **Step 1: Write the onboarding-state test**

```ts
test("onboarding blocks publish until required appointment sections are complete", () => {
  const result = deriveOnboardingState({
    ownerCreated: true,
    businessConfigured: true,
    locations: 1,
    activeServices: 1,
    activePractitioners: 0,
    operatingIntervals: 5,
    emailReady: false,
    published: false,
  });
  assert.equal(result.nextStep, "staff");
  assert.equal(result.canPublish, false);
});
```

- [ ] **Step 2: Run console tests**

Run: `pnpm --dir apps/console run test`

Expected: FAIL because onboarding state is absent.

- [ ] **Step 3: Implement deterministic onboarding progression**

`deriveOnboardingState` returns the first incomplete step from this fixed order: business, location, services, staff, hours, channels, review. It must derive state from API records, not browser local storage. Each page saves through a server action and redirects to the next incomplete step.

- [ ] **Step 4: Narrow the Studio presentation**

Rename the primary navigation item from **Experience Studio** to **Business Setup** for production. Hide the preset catalogue from production navigation and keep appointment terminology fixed. Existing preset routes may remain reachable only in the explicit development/evaluation profile.

- [ ] **Step 5: Add an onboarding E2E scenario**

Create `tests/e2e/production-onboarding.e2e.ts` that starts with an unused installation fixture, creates the owner, configures one location/service/practitioner/hours, validates, publishes, and asserts the public slug loads. It must assert the production fixture contains no `final_demo` record.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm --dir apps/console run test
pnpm --dir apps/console run typecheck
pnpm --dir apps/console run build
node --import tsx --test tests/e2e/production-onboarding.e2e.ts
```

Expected: all pass against the database-backed test stack.

```bash
git add apps/console tests/e2e/production-onboarding.e2e.ts
git commit -m "feat(console): add appointment business onboarding"
```

### Task 7: Add Staff Invitations, Password Reset, and Location Assignment UI

**Files:**
- Create: `apps/console/app/settings/staff/page.tsx`
- Create: `apps/console/app/settings/staff/actions.ts`
- Create: `apps/console/app/invite/[token]/page.tsx`
- Create: `apps/console/app/reset-password/page.tsx`
- Create: `apps/console/app/reset-password/[token]/page.tsx`
- Create: `apps/console/lib/staff-access.ts`
- Create: `apps/console/lib/staff-access.test.ts`
- Modify: `apps/console/components/console-shell.tsx`
- Modify: `packages/reservation-platform-api/src/staff.ts`
- Modify: `packages/reservation-platform-api/src/staff.test.ts`
- Modify: `apps/api/src/routes.ts`

**Interfaces:**
- Consumes: invitation/reset auth routes and venue assignment service.
- Produces: owner staff administration plus public one-time invite/reset completion pages.

- [ ] **Step 1: Write staff access view tests**

```ts
test("owner sees staff administration while staff does not", () => {
  assert.equal(staffNavigation({ role: "owner" }).includes("/admin/settings/staff"), true);
  assert.equal(staffNavigation({ role: "staff" }).includes("/admin/settings/staff"), false);
});

test("venue options mark only the staff member assignments", () => {
  assert.deepEqual(venueAssignmentOptions(venues, ["venue-b"]), [
    { venueId: "venue-a", selected: false },
    { venueId: "venue-b", selected: true },
  ]);
});
```

- [ ] **Step 2: Run console and staff-service tests**

Run:

```bash
pnpm --dir apps/console run test
pnpm --dir packages/reservation-platform-api exec node --import tsx --test src/staff.test.ts
```

Expected: FAIL for missing staff UI helpers and assignment operations.

- [ ] **Step 3: Implement owner staff administration**

Owners can invite, disable/reactivate, and assign staff to locations. Invitation creation writes a hashed 24-hour token and an audit event. Until Phase 3 email is configured, the owner sees the invitation URL exactly once over HTTPS with instructions to transfer it privately; it is never retrievable again. After Phase 3, invitation delivery uses the email job and the API stops returning the raw URL.

- [ ] **Step 4: Implement invite and reset completion**

The invitation page validates the token, collects display name and a 12–128 character password, activates the account, consumes the token, and creates a session. Password-reset request always shows the same accepted message; completion sets the new Argon2id hash, consumes the token, revokes existing sessions, and redirects to login.

- [ ] **Step 5: Verify authorization and commit**

Run console tests/typecheck/build, API tests, and an auth E2E covering owner invite, staff login, venue denial, password reset, and disabled-user rejection.

```bash
git add apps/console packages/reservation-platform-api/src/staff* apps/api/src/routes.ts tests/e2e/production-auth.e2e.ts
git commit -m "feat(console): administer staff access and recovery"
```

## Phase 2 Exit Gate

Required evidence:

- Setup token works once and is rejected after owner creation.
- The console operates without a fixed service API key, tenant ID, or venue ID.
- Password and session tokens are stored only as secure hashes.
- Staff cannot access unassigned locations or owner-only actions.
- A new owner configures and publishes an appointment business through `/admin` without editing files.
- Production contains no automatic demo identity or seed.
- Auth, console, API, SDK, migration, and production-onboarding tests pass.
