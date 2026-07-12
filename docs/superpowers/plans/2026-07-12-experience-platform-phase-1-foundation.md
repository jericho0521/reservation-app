# Experience Platform Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the independently testable Week 1 foundation: tenant/venue-scoped experience contracts, preset definitions, draft/published persistence, owner/public API and SDK methods, and a server-authenticated console shell that can read the workspace.

**Architecture:** Extend the current contract → framework-neutral API → Supabase adapter → standalone host → SDK layering. Keep experience preset and validation logic in the existing backend API package, persist only venue-scoped profiles and configuration versions, and let the new Next.js console call the SDK from server code so service credentials never enter browser bundles.

**Tech Stack:** pnpm 10.33.2, strict TypeScript, Node test runner with `tsx`, Zod 3, PostgreSQL/Supabase SQL, Next.js 16, React 19.

## Global Constraints

- Preserve the existing package boundaries: frontend code must not import Supabase, database adapters, or backend runtime modules.
- Use Baileys as the primary WhatsApp provider; Phase 1 does not change WhatsApp behavior.
- Use the existing tenant and venue request context instead of creating a second tenancy model.
- Public experience responses contain published, browser-safe configuration only.
- Owner console credentials remain server-only and must not use `NEXT_PUBLIC_*` names.
- Use plain `pnpm`; do not introduce `corepack pnpm` commands.
- Follow TDD: failing focused test, minimal implementation, passing focused test, affected suite, commit.
- Do not include unrelated dirty-worktree changes in any task commit.
- Phase 1 does not implement Studio editing, catalog mutations, chat, inbox, analytics, or customer self-service.

---

## Scope Decomposition

The approved six-week design contains independent subsystems. This plan implements only Phase 1. Later plans consume the interfaces established here:

1. Phase 2: Experience Studio editing, validation UI, preview, and publishing UI.
2. Phase 3: Service/resource management, public booking experiences, and all presets.
3. Phase 4: AI web chat, Baileys console, unified conversations, and simulation.
4. Phase 5: Operations dashboard and analytics.
5. Phase 6: security proofs, E2E hardening, seed/reset tooling, and presentation.

## File Structure

### Contract boundary

- Modify `packages/contract-types/src/index.ts` — public experience DTOs and input types.
- Modify `packages/contract-types/src/schemas.ts` — strict Zod schemas for those DTOs.
- Modify `packages/contract-types/src/contract-artifact-registry.ts` — generated contract/OpenAPI registry entries.
- Modify `packages/contract-types/src/schemas.test.ts` — positive and negative contract tests.

### Framework-neutral domain and API

- Create `packages/reservation-platform-api/src/experience-presets.ts` — immutable eight-preset registry and draft validation.
- Create `packages/reservation-platform-api/src/experience-presets.test.ts` — registry completeness and validation tests.
- Create `packages/reservation-platform-api/src/experience-studio.ts` — repository port and use cases for workspace, draft save, publish, and public read.
- Create `packages/reservation-platform-api/src/experience-studio.test.ts` — use-case, scoping, and error mapping tests.
- Modify `packages/reservation-platform-api/src/index.ts` — export the two focused modules.

### Database ownership

- Create `packages/database/migrations/supabase/000015_experience_studio_foundation.sql` — tenants, scoped venue/service compatibility, business profiles, versioned configuration, and atomic publish RPC.
- Modify `scripts/generate-database-migration-index.mjs` — add migration 000015 to the core target list.
- Modify `packages/database/migrations/supabase/migration-index.json` — regenerate, do not hand-edit checksums.
- Modify `packages/database/src/supabase-migrations.test.ts` — expect core migrations 000001–000015.
- Modify `docs/package-refactor/backend-platform-extraction/database-migration-bundle-manifest.json` and `docs/package-refactor/backend-platform-extraction/database-sql-ownership-inventory.json` only as required by the existing generator/verifier contract.

### Supabase adapter

- Create `packages/reservations-supabase/src/experience-studio.ts` — profile/configuration repository and publish RPC adapter.
- Create `packages/reservations-supabase/src/experience-studio.test.ts` — exact query/RPC-shape tests.
- Modify `packages/reservations-supabase/src/index.ts` — export the new repository factory only.

### Standalone API host

- Modify `apps/api/src/routes.ts` — dependency port, protected owner routes, public slug route, and body parsing.
- Modify `apps/api/src/routes.test.ts` — authorization, delegation, validation, and public sanitization tests.
- Modify `apps/api/src/runtime.ts` — construct and inject the Supabase experience repository.
- Modify `apps/api/src/runtime.test.ts` — dependency wiring test.

### SDK and console

- Modify `packages/sdk/src/index.ts` — typed experience methods.
- Modify `packages/sdk/src/index.test.ts` — URL, headers, method, and body tests.
- Create `apps/console/package.json`, `apps/console/tsconfig.json`, `apps/console/next.config.ts` — workspace app configuration.
- Create `apps/console/app/layout.tsx`, `apps/console/app/page.tsx`, `apps/console/app/studio/page.tsx`, `apps/console/app/globals.css` — read-only Phase 1 shell.
- Create `apps/console/components/console-shell.tsx`, `apps/console/components/setup-error.tsx` — focused presentational units.
- Create `apps/console/lib/platform-client-config.ts`, `apps/console/lib/platform-client-config.test.ts` — pure environment validation that is safe to unit test.
- Create `apps/console/lib/platform-client.ts` — server-only SDK construction.
- Modify `package.json` — console build/typecheck scripts.
- Create `tests/e2e/console-foundation.e2e.ts` — frontend boundary and optional live page proof.
- Modify `README.md` — Phase 1 console startup instructions.

---

### Task 1: Define experience contracts and schemas

**Files:**
- Modify: `packages/contract-types/src/index.ts`
- Modify: `packages/contract-types/src/schemas.ts`
- Modify: `packages/contract-types/src/contract-artifact-registry.ts`
- Test: `packages/contract-types/src/schemas.test.ts`

**Interfaces:**
- Consumes: existing `JsonValue`, `MetadataRecord`, tenant/venue request context conventions.
- Produces: `ExperiencePresetId`, `BusinessProfileResponse`, `ExperienceConfigurationResponse`, `ExperienceWorkspaceResponse`, `ExperienceDraftInput`, `ExperienceValidationResponse`, `PublicExperienceResponse`, and matching Zod schemas.

- [ ] **Step 1: Write failing schema tests**

Append tests that prove strict parsing and public/private separation:

```ts
import {
  experienceDraftInputSchema,
  experienceWorkspaceResponseSchema,
  publicExperienceResponseSchema,
} from "./schemas.js";

test("experience workspace accepts venue-scoped profile and draft", () => {
  const result = experienceWorkspaceResponseSchema.parse({
    profile: {
      business_id: "business_1",
      tenant_id: "tenant_1",
      venue_id: "venue_1",
      name: "Apex Racing",
      public_slug: "apex-racing",
      preset_id: "racing_gaming",
      status: "draft",
    },
    draft: {
      configuration_id: "config_1",
      business_id: "business_1",
      version: 1,
      state: "draft",
      preset_id: "racing_gaming",
      branding: { brand_name: "Apex Racing", primary_color: "#f59e0b" },
      terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
      channels: { web_booking: true, web_chat: false, whatsapp: false },
      updated_at: "2026-07-13T00:00:00.000Z",
    },
  });
  assert.equal(result.profile.tenant_id, "tenant_1");
});

test("public experience rejects draft state and private metadata", () => {
  assert.throws(() => publicExperienceResponseSchema.parse({
    profile: {
      business_id: "business_1",
      name: "Apex Racing",
      public_slug: "apex-racing",
      preset_id: "racing_gaming",
    },
    configuration: {
      configuration_id: "config_1",
      business_id: "business_1",
      version: 1,
      state: "draft",
      preset_id: "racing_gaming",
      branding: { brand_name: "Apex Racing" },
      terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
      channels: { web_booking: true, web_chat: false, whatsapp: false },
      updated_at: "2026-07-13T00:00:00.000Z",
    },
    private_metadata: { secret: "no" },
  }));
});

test("experience draft rejects unknown preset ids", () => {
  assert.throws(() => experienceDraftInputSchema.parse({
    preset_id: "unknown",
    branding: { brand_name: "Demo" },
    terminology: { customer: "Customer", resource: "Resource", booking: "Booking" },
    channels: { web_booking: true, web_chat: false, whatsapp: false },
  }));
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --filter @reservation-platform/contract-types exec node --import tsx --test src/schemas.test.ts`

Expected: FAIL because the experience schemas are not exported.

- [ ] **Step 3: Add the exact public types and schemas**

Add these types to `src/index.ts`:

```ts
export type ExperiencePresetId =
  | "racing_gaming"
  | "rooms_facilities"
  | "appointments_salon"
  | "sports_courts"
  | "restaurant_tables"
  | "cinema_events"
  | "equipment_rental"
  | "classes_workshops";

export type ExperienceConfigurationState = "draft" | "published" | "archived";

export interface ExperienceBranding {
  brand_name: string;
  primary_color?: string;
  secondary_color?: string;
  logo_url?: string;
  description?: string;
}

export interface ExperienceTerminology {
  customer: string;
  resource: string;
  booking: string;
}

export interface ExperienceChannels {
  web_booking: boolean;
  web_chat: boolean;
  whatsapp: boolean;
}

export interface ExperiencePresetSummary {
  preset_id: ExperiencePresetId;
  name: string;
  description: string;
  resource_strategy: "quantity" | "assigned_resource" | "hybrid";
  terminology: ExperienceTerminology;
}

export interface BusinessProfileResponse {
  business_id: string;
  tenant_id: string;
  venue_id: string;
  name: string;
  public_slug: string;
  preset_id: ExperiencePresetId;
  status: "draft" | "published" | "archived";
}

export interface ExperienceConfigurationResponse {
  configuration_id: string;
  business_id: string;
  version: number;
  state: ExperienceConfigurationState;
  preset_id: ExperiencePresetId;
  branding: ExperienceBranding;
  terminology: ExperienceTerminology;
  channels: ExperienceChannels;
  updated_at: string;
  published_at?: string;
}

export interface ExperienceDraftInput {
  preset_id: ExperiencePresetId;
  branding: ExperienceBranding;
  terminology: ExperienceTerminology;
  channels: ExperienceChannels;
}

export interface ExperienceWorkspaceResponse {
  profile: BusinessProfileResponse;
  draft?: ExperienceConfigurationResponse;
  published?: ExperienceConfigurationResponse;
}

export interface ExperienceValidationIssue {
  path: string;
  message: string;
}

export interface ExperienceValidationResponse {
  valid: boolean;
  issues: ExperienceValidationIssue[];
}

export interface PublicExperienceResponse {
  profile: Omit<BusinessProfileResponse, "tenant_id" | "venue_id" | "status">;
  configuration: ExperienceConfigurationResponse & { state: "published" };
}
```

Implement strict Zod equivalents in `schemas.ts`. Use `z.enum([...])`, `strictObject`, `z.string().min(1)`, `z.number().int().positive()`, and `z.string().regex(/^#[0-9a-fA-F]{6}$/)` for configured colors. Register the response schemas and owner/public operations in `contract-artifact-registry.ts` using the existing registry helpers; do not hand-edit generated artifacts.

- [ ] **Step 4: Run contract generation and tests**

Run:

```bash
pnpm --filter @reservation-platform/contract-types run contracts:generate
pnpm --filter @reservation-platform/contract-types run test
```

Expected: contract artifacts regenerate and all contract tests PASS.

- [ ] **Step 5: Commit the contract boundary**

```bash
git add packages/contract-types
git commit -m "feat(contracts): add experience studio types"
```

---

### Task 2: Add the immutable preset registry and draft validation

**Files:**
- Create: `packages/reservation-platform-api/src/experience-presets.ts`
- Create: `packages/reservation-platform-api/src/experience-presets.test.ts`
- Modify: `packages/reservation-platform-api/src/index.ts`

**Interfaces:**
- Consumes: `ExperienceDraftInput`, `ExperiencePresetId`, `ExperiencePresetSummary`, `ExperienceValidationResponse` from Task 1.
- Produces: `experiencePresets`, `listExperiencePresets()`, `getExperiencePreset(id)`, `createExperienceDraftFromPreset(id)`, `validateExperienceDraft(input)`.

- [ ] **Step 1: Write failing preset tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createExperienceDraftFromPreset,
  experiencePresets,
  validateExperienceDraft,
} from "./experience-presets.js";

test("registry contains exactly eight unique presets", () => {
  assert.equal(experiencePresets.length, 8);
  assert.equal(new Set(experiencePresets.map((preset) => preset.preset_id)).size, 8);
});

test("racing preset creates an assigned-resource draft", () => {
  assert.deepEqual(createExperienceDraftFromPreset("racing_gaming"), {
    preset_id: "racing_gaming",
    branding: { brand_name: "Racing & Gaming", primary_color: "#f59e0b" },
    terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
    channels: { web_booking: true, web_chat: false, whatsapp: false },
  });
});

test("validation reports exact missing paths", () => {
  assert.deepEqual(validateExperienceDraft({
    preset_id: "rooms_facilities",
    branding: { brand_name: "" },
    terminology: { customer: "Organizer", resource: "", booking: "Meeting" },
    channels: { web_booking: false, web_chat: false, whatsapp: false },
  }), {
    valid: false,
    issues: [
      { path: "branding.brand_name", message: "Business name is required." },
      { path: "terminology.resource", message: "Resource terminology is required." },
      { path: "channels", message: "At least one customer channel must be enabled." },
    ],
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm --filter @reservation-platform/api exec node --import tsx --test src/experience-presets.test.ts`

Expected: FAIL because `experience-presets.ts` does not exist.

- [ ] **Step 3: Implement the registry and validator**

Define all eight presets as a frozen `readonly ExperiencePresetSummary[]`. Implement exact-id lookup and return fresh draft objects so callers cannot mutate registry data:

```ts
export function getExperiencePreset(id: ExperiencePresetId) {
  return experiencePresets.find((preset) => preset.preset_id === id);
}

export function createExperienceDraftFromPreset(id: ExperiencePresetId): ExperienceDraftInput {
  const preset = getExperiencePreset(id);
  if (!preset) throw new Error(`Unknown experience preset: ${id}`);
  return {
    preset_id: preset.preset_id,
    branding: {
      brand_name: preset.name,
      primary_color: preset.preset_id === "racing_gaming" ? "#f59e0b" : "#2563eb",
    },
    terminology: { ...preset.terminology },
    channels: { web_booking: true, web_chat: false, whatsapp: false },
  };
}
```

Create summaries for the eight approved names and strategies. `validateExperienceDraft` must trim required strings, validate six-digit hex colors when present, and require at least one enabled channel. Export the module from `index.ts`.

- [ ] **Step 4: Run focused and package tests**

Run:

```bash
pnpm --filter @reservation-platform/api exec node --import tsx --test src/experience-presets.test.ts
pnpm --filter @reservation-platform/api run test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the preset domain**

```bash
git add packages/reservation-platform-api/src/experience-presets.ts packages/reservation-platform-api/src/experience-presets.test.ts packages/reservation-platform-api/src/index.ts
git commit -m "feat(api): add experience preset registry"
```

---

### Task 3: Add the experience foundation migration and publish RPC

**Files:**
- Create: `packages/database/migrations/supabase/000015_experience_studio_foundation.sql`
- Modify: `scripts/generate-database-migration-index.mjs`
- Modify: `packages/database/src/supabase-migrations.test.ts`
- Regenerate: `packages/database/migrations/supabase/migration-index.json`
- Modify only if verifier requires: `docs/package-refactor/backend-platform-extraction/database-migration-bundle-manifest.json`
- Modify only if verifier requires: `docs/package-refactor/backend-platform-extraction/database-sql-ownership-inventory.json`

**Interfaces:**
- Consumes: existing `venues`, `services`, `set_updated_at()`, service-role access model.
- Produces: `tenants`, scoped compatibility columns, `platform_business_profiles`, `platform_experience_configurations`, and `platform_publish_experience_configuration(text, uuid, uuid)`.

- [ ] **Step 1: Update the migration-plan test first**

Change the expected core sequence to include `000015` and assert length 15:

```ts
test("core plan includes exactly 000001 through 000015 in order", async () => {
  const index = await readActualIndex();
  const plan = buildSupabaseMigrationPlan(index);
  assert.deepEqual(
    plan.migrations.map((entry) => entry.path.match(/\/(\d{6})_[^/]+\.sql$/)?.[1]),
    Array.from({ length: 15 }, (_, index) => String(index + 1).padStart(6, "0")),
  );
  assert.equal(plan.migrations.length, 15);
});
```

- [ ] **Step 2: Run the database test and verify failure**

Run: `pnpm --filter @reservation-platform/database run test`

Expected: FAIL because 000015 is absent from the generated core index.

- [ ] **Step 3: Write the migration**

The migration must contain these concrete definitions:

```sql
create table if not exists public.tenants (
  id text primary key check (length(trim(id)) > 0),
  name text not null check (length(trim(name)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.tenants (id, name)
values ('platform_default', 'Reservation Platform')
on conflict (id) do nothing;

alter table public.venues add column if not exists tenant_id text references public.tenants(id);
update public.venues set tenant_id = 'platform_default' where tenant_id is null;

insert into public.venues (id, tenant_id, name)
select '00000000-0000-0000-0000-000000000001', 'platform_default', 'Reservation Business'
where not exists (select 1 from public.venues);

alter table public.venues alter column tenant_id set not null;
create unique index if not exists venues_tenant_id_id_key on public.venues (tenant_id, id);

alter table public.services add column if not exists venue_id uuid references public.venues(id);
update public.services
set venue_id = (select id from public.venues order by created_at, id limit 1)
where venue_id is null;
alter table public.services alter column venue_id set not null;
create index if not exists services_venue_id_idx on public.services (venue_id, updated_at desc);

create table if not exists public.platform_business_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  venue_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  public_slug text not null check (public_slug = lower(public_slug) and public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  preset_id text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, venue_id),
  foreign key (tenant_id, venue_id) references public.venues (tenant_id, id)
);

create unique index if not exists platform_business_profiles_slug_key
on public.platform_business_profiles (lower(public_slug));

create table if not exists public.platform_experience_configurations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.platform_business_profiles(id) on delete cascade,
  version integer not null check (version > 0),
  state text not null default 'draft' check (state in ('draft', 'published', 'archived')),
  preset_id text not null,
  branding jsonb not null,
  terminology jsonb not null,
  channels jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (business_id, version)
);

create unique index if not exists platform_experience_one_draft_idx
on public.platform_experience_configurations (business_id) where state = 'draft';

create unique index if not exists platform_experience_one_published_idx
on public.platform_experience_configurations (business_id) where state = 'published';
```

Add update triggers, enable RLS, revoke `anon`/`authenticated` direct access, grant CRUD to `service_role`, and define a `security definer` publish RPC that:

1. Selects the business by `tenant_id` and `venue_id`.
2. Locks the requested draft.
3. Archives the current published configuration.
4. Marks the requested draft published with `published_at = now()`.
5. Updates the business profile to `published`.
6. Returns the published row.

Pin the function `search_path` to `public`, revoke it from `public`, and grant execute only to `service_role`.

- [ ] **Step 4: Register, regenerate, and verify the migration bundle**

Add the exact 000015 path to `expectedCoreTargets`, then run:

```bash
pnpm run database:migration-index:generate
pnpm --filter @reservation-platform/database run test
pnpm run database:verify-migration-bundle
```

Expected: migration index is current, 15 core migrations are ordered, and bundle verification PASSes.

- [ ] **Step 5: Commit the database foundation**

```bash
git add packages/database/migrations/supabase/000015_experience_studio_foundation.sql packages/database/migrations/supabase/migration-index.json packages/database/src/supabase-migrations.test.ts scripts/generate-database-migration-index.mjs docs/package-refactor/backend-platform-extraction/database-migration-bundle-manifest.json docs/package-refactor/backend-platform-extraction/database-sql-ownership-inventory.json
git commit -m "feat(database): add experience studio foundation"
```

If either documentation JSON file is unchanged, omit it from `git add` rather than forcing a rewrite.

---

### Task 4: Implement framework-neutral experience use cases

**Files:**
- Create: `packages/reservation-platform-api/src/experience-studio.ts`
- Create: `packages/reservation-platform-api/src/experience-studio.test.ts`
- Modify: `packages/reservation-platform-api/src/index.ts`

**Interfaces:**
- Consumes: Task 1 DTOs and Task 2 `listExperiencePresets`, `validateExperienceDraft`.
- Produces: `ExperienceScope`, `ExperienceStudioRepository`, `readExperienceWorkspace`, `saveExperienceDraft`, `publishExperienceDraft`, `readPublicExperience`.

- [ ] **Step 1: Write failing use-case tests**

```ts
test("save rejects an invalid draft before repository work", async () => {
  let saved = false;
  const repository = fakeExperienceRepository({
    async saveDraft() { saved = true; throw new Error("must not run"); },
  });
  const result = await saveExperienceDraft({
    scope: { tenantId: "tenant_1", venueId: "venue_1" },
    input: {
      preset_id: "rooms_facilities",
      branding: { brand_name: "" },
      terminology: { customer: "Organizer", resource: "Room", booking: "Meeting" },
      channels: { web_booking: false, web_chat: false, whatsapp: false },
    },
    repository,
  });
  assert.equal(result.status, 400);
  assert.equal(saved, false);
});

test("public read omits tenant and venue identifiers", async () => {
  const result = await readPublicExperience({
    slug: "apex-racing",
    repository: fakeExperienceRepository({ published: publishedFixture() }),
  });
  assert.equal(result.status, 200);
  assert.equal("tenant_id" in result.body.profile, false);
  assert.equal("venue_id" in result.body.profile, false);
  assert.equal(result.body.configuration.state, "published");
});
```

The test file must define complete `fakeExperienceRepository` and fixture helpers returning the Task 1 types.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --filter @reservation-platform/api exec node --import tsx --test src/experience-studio.test.ts`

Expected: FAIL because the use-case module does not exist.

- [ ] **Step 3: Implement the repository port and use cases**

Use this exact port shape:

```ts
export interface ExperienceScope {
  tenantId: string;
  venueId: string;
}

export interface ExperienceStudioRepository {
  readWorkspace(scope: ExperienceScope): Promise<ExperienceWorkspaceResponse | undefined>;
  saveDraft(scope: ExperienceScope, input: ExperienceDraftInput): Promise<ExperienceWorkspaceResponse>;
  publishDraft(scope: ExperienceScope, configurationId: string): Promise<ExperienceWorkspaceResponse | undefined>;
  readPublishedBySlug(slug: string): Promise<{
    profile: BusinessProfileResponse;
    configuration: ExperienceConfigurationResponse;
  } | undefined>;
}
```

All owner functions must reject blank tenant or venue IDs before repository work. Map absent workspace/draft/publication to stable `not_found`, validation problems to `validation_failed`, publish-without-draft to `conflict`, and storage exceptions to sanitized `internal_error`. `readPublicExperience` must construct the explicit public projection field-by-field; never spread the private profile.

- [ ] **Step 4: Run focused and package tests**

Run:

```bash
pnpm --filter @reservation-platform/api exec node --import tsx --test src/experience-studio.test.ts
pnpm --filter @reservation-platform/api run test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the use-case boundary**

```bash
git add packages/reservation-platform-api/src/experience-studio.ts packages/reservation-platform-api/src/experience-studio.test.ts packages/reservation-platform-api/src/index.ts
git commit -m "feat(api): add experience studio use cases"
```

---

### Task 5: Implement the Supabase experience repository

**Files:**
- Create: `packages/reservations-supabase/src/experience-studio.ts`
- Create: `packages/reservations-supabase/src/experience-studio.test.ts`
- Modify: `packages/reservations-supabase/src/index.ts`

**Interfaces:**
- Consumes: `ExperienceStudioRepository` and `ExperienceScope` from Task 4; Task 1 DTOs; Supabase-like client conventions.
- Produces: `createSupabaseExperienceStudioRepository(client)`.

- [ ] **Step 1: Write failing query-shape tests**

Use the existing fluent fake-client style from `src/index.test.ts` and assert:

```ts
test("experience repository scopes workspace reads to tenant and venue", async () => {
  const calls: Array<[string, unknown]> = [];
  const repository = createSupabaseExperienceStudioRepository(fakeClient(calls, {
    platform_business_profiles: [profileRow()],
    platform_experience_configurations: [draftRow()],
  }));
  const workspace = await repository.readWorkspace({ tenantId: "tenant_1", venueId: "venue_1" });
  assert.equal(workspace?.profile.tenant_id, "tenant_1");
  assert.deepEqual(calls.filter(([name]) => name === "eq"), [
    ["eq", ["tenant_id", "tenant_1"]],
    ["eq", ["venue_id", "venue_1"]],
  ]);
});

test("publish uses the atomic scoped RPC", async () => {
  const rpcCalls: unknown[] = [];
  const repository = createSupabaseExperienceStudioRepository(fakeRpcClient(rpcCalls, publishedRow()));
  await repository.publishDraft(
    { tenantId: "tenant_1", venueId: "venue_1" },
    "config_1",
  );
  assert.deepEqual(rpcCalls[0], ["platform_publish_experience_configuration", {
    p_tenant_id: "tenant_1",
    p_venue_id: "venue_1",
    p_configuration_id: "config_1",
  }]);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --filter @project-play/reservations-supabase exec node --import tsx --test src/experience-studio.test.ts`

Expected: FAIL because the repository factory is missing.

- [ ] **Step 3: Implement row adapters and repository methods**

Define table constants locally in the focused module. `readWorkspace` must:

1. Query one profile by `tenant_id` and `venue_id`.
2. Return `undefined` when no profile exists.
3. Query configuration rows by `business_id`, ordered by `version desc`.
4. Select the first `draft` and first `published` row.

`saveDraft` must upsert the profile first, read the current draft, and upsert one draft with `version = max(existing versions) + 1` only when creating a new draft. Updates to an existing draft preserve its version. `publishDraft` calls the RPC then rereads the workspace. `readPublishedBySlug` must query `lower(public_slug)` through the supported Supabase filter shape and require a published configuration.

Row adapters must construct DTOs field-by-field and reject malformed JSON objects with `Error("Experience configuration row is invalid.")`.

- [ ] **Step 4: Run focused and package tests**

Run:

```bash
pnpm --filter @project-play/reservations-supabase exec node --import tsx --test src/experience-studio.test.ts
pnpm --filter @project-play/reservations-supabase run test
```

Expected: all adapter tests PASS.

- [ ] **Step 5: Commit the persistence adapter**

```bash
git add packages/reservations-supabase/src/experience-studio.ts packages/reservations-supabase/src/experience-studio.test.ts packages/reservations-supabase/src/index.ts
git commit -m "feat(supabase): add experience studio repository"
```

---

### Task 6: Mount owner and public experience routes

**Files:**
- Modify: `apps/api/src/routes.ts`
- Modify: `apps/api/src/routes.test.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/runtime.test.ts`

**Interfaces:**
- Consumes: Task 4 use cases and repository port; Task 5 repository factory.
- Produces these routes:
  - `GET /v1/experience/presets`
  - `GET /v1/experience/workspace`
  - `PUT /v1/experience/draft`
  - `POST /v1/experience/publish`
  - `GET /v1/public/experiences/{slug}`

- [ ] **Step 1: Write failing route tests**

Add a fake `ExperienceStudioRepository` to route dependencies and tests for protection, context, validation, and public access:

```ts
test("owner experience routes require auth and tenant venue context", async () => {
  const response = await handleStandaloneApiRequest({
    method: "GET",
    path: "/v1/experience/workspace",
    headers: {},
  }, {
    serviceApiKey: "secret",
    experienceStudioRepository: fakeExperienceRepository(),
  });
  assert.equal(response.status, 401);
});

test("public experience route does not require owner auth", async () => {
  const response = await handleStandaloneApiRequest({
    method: "GET",
    path: "/v1/public/experiences/apex-racing",
    headers: {},
  }, {
    serviceApiKey: "secret",
    experienceStudioRepository: fakeExperienceRepository({ published: publishedFixture() }),
  });
  assert.equal(response.status, 200);
  assert.equal((response.body as PublicExperienceResponse).profile.public_slug, "apex-racing");
});
```

Also test malformed JSON, invalid slug, missing draft ID on publish, and repository-disabled 503 responses.

- [ ] **Step 2: Run API tests and verify failure**

Run: `pnpm --filter @reservation-platform/standalone-api-skeleton exec node --import tsx --test src/routes.test.ts src/runtime.test.ts`

Expected: FAIL because the dependency and routes are absent.

- [ ] **Step 3: Implement routes and runtime wiring**

Add `experienceStudioRepository?: ExperienceStudioRepository` to `StandaloneApiDependencies`. Owner routes must remain in the existing auth pipeline and require both `X-Reservation-Tenant-Id` and `X-Reservation-Venue-Id`. Add them to protected-route metadata. The public slug route must bypass owner auth but validate slugs with `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`.

Parse `PUT` with `experienceDraftInputSchema.safeParse`. Parse publish body as strict `{ configuration_id: string }`. Delegate to Task 4 functions and return their stable status/body.

In `runtime.ts`, create the repository from the service-role client alongside the existing repositories:

```ts
experienceStudioRepository: createSupabaseExperienceStudioRepository(
  createClient(
    normalizedConfig.supabaseUrl,
    normalizedConfig.supabaseServiceRoleKey,
    standaloneSupabaseClientOptions,
  ) as unknown as SupabaseLikeClient,
),
```

Reuse an existing admin client instance if the runtime already constructs one in the same scope; do not create redundant clients merely to match the snippet.

- [ ] **Step 4: Run the standalone API suite**

Run: `pnpm --filter @reservation-platform/standalone-api-skeleton run test`

Expected: route and runtime tests PASS. If localhost listener tests require sandbox approval, rerun the same command outside the sandbox; do not skip them or modify tests to hide `EPERM`.

- [ ] **Step 5: Commit the host integration**

```bash
git add apps/api/src/routes.ts apps/api/src/routes.test.ts apps/api/src/runtime.ts apps/api/src/runtime.test.ts
git commit -m "feat(api-host): mount experience studio routes"
```

---

### Task 7: Add typed SDK experience methods

**Files:**
- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/src/index.test.ts`

**Interfaces:**
- Consumes: Task 1 DTOs and Task 6 route paths.
- Produces SDK methods `listExperiencePresets`, `getExperienceWorkspace`, `saveExperienceDraft`, `publishExperienceDraft`, and `getPublicExperience`.

- [ ] **Step 1: Write failing request-shape tests**

```ts
test("experience SDK methods use scoped owner and unscoped public routes", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createReservationPlatformClient({
    baseUrl: "https://platform.example",
    tenantId: "tenant_1",
    venueId: "venue_1",
    getAccessToken: () => "token",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json(url.toString().includes("public/experiences")
        ? publicExperienceFixture()
        : workspaceFixture());
    },
  });
  await client.getExperienceWorkspace();
  await client.getPublicExperience("apex-racing");
  assert.equal(requests[0].url, "https://platform.example/v1/experience/workspace");
  assert.equal(new Headers(requests[0].init?.headers).get("X-Reservation-Tenant-Id"), "tenant_1");
  assert.equal(requests[1].url, "https://platform.example/v1/public/experiences/apex-racing");
});
```

Add focused assertions for `PUT` draft JSON and `POST` publish JSON.

- [ ] **Step 2: Run focused SDK tests and verify failure**

Run: `pnpm --filter @reservation-platform/sdk exec node --import tsx --test src/index.test.ts`

Expected: FAIL because the SDK interface lacks the experience methods.

- [ ] **Step 3: Implement SDK methods**

Extend `ReservationPlatformClient` with:

```ts
listExperiencePresets(options?: RequestOptions): Promise<{ presets: ExperiencePresetSummary[] }>;
getExperienceWorkspace(options?: RequestOptions): Promise<ExperienceWorkspaceResponse>;
saveExperienceDraft(input: ExperienceDraftInput, options?: RequestOptions): Promise<ExperienceWorkspaceResponse>;
publishExperienceDraft(configurationId: string, options?: RequestOptions): Promise<ExperienceWorkspaceResponse>;
getPublicExperience(slug: string, options?: RequestOptions): Promise<PublicExperienceResponse>;
```

Map these to the exact Task 6 paths. Encode the public slug with `encodeURIComponent`. Draft uses `PUT`, so extend `HttpMethod` to include `PUT`. Publish body is `{ configuration_id: configurationId }`.

- [ ] **Step 4: Run SDK tests and boundary verification**

Run:

```bash
pnpm --filter @reservation-platform/sdk run test
pnpm run packages:verify-boundaries
```

Expected: SDK tests and frontend/backend boundary checks PASS.

- [ ] **Step 5: Commit the SDK surface**

```bash
git add packages/sdk/src/index.ts packages/sdk/src/index.test.ts
git commit -m "feat(sdk): add experience studio client methods"
```

---

### Task 8: Create the server-authenticated owner console shell

**Files:**
- Create: `apps/console/package.json`
- Create: `apps/console/tsconfig.json`
- Create: `apps/console/next.config.ts`
- Create: `apps/console/app/layout.tsx`
- Create: `apps/console/app/page.tsx`
- Create: `apps/console/app/studio/page.tsx`
- Create: `apps/console/app/globals.css`
- Create: `apps/console/components/console-shell.tsx`
- Create: `apps/console/components/setup-error.tsx`
- Create: `apps/console/lib/platform-client-config.ts`
- Create: `apps/console/lib/platform-client-config.test.ts`
- Create: `apps/console/lib/platform-client.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 7 SDK methods and server-only env values.
- Produces: console on port 4300 with Overview and read-only Studio foundation.

- [ ] **Step 1: Write the failing server-config test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readConsolePlatformConfig } from "./platform-client-config.js";

test("console config reads the complete server-only platform scope", () => {
  assert.deepEqual(readConsolePlatformConfig({
    RESERVATION_PLATFORM_BASE_URL: "https://api.example",
    RESERVATION_PLATFORM_SERVICE_API_KEY: "server-secret",
    RESERVATION_CONSOLE_TENANT_ID: "tenant_1",
    RESERVATION_CONSOLE_VENUE_ID: "venue_1",
  }), {
    baseUrl: "https://api.example",
    apiKey: "server-secret",
    tenantId: "tenant_1",
    venueId: "venue_1",
  });
});

test("console config fails closed for incomplete server config", () => {
  assert.throws(() => readConsolePlatformConfig({}), /RESERVATION_PLATFORM_BASE_URL/);
});

test("platform client module is guarded as server-only", async () => {
  const source = await readFile(new URL("./platform-client.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/u);
  assert.doesNotMatch(source, /NEXT_PUBLIC_/u);
});
```

- [ ] **Step 2: Scaffold package files and verify the test fails**

Use this package script/dependency shape and copy the existing example app's TypeScript and Turbopack structure:

```json
{
  "name": "@reservation-platform/console",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 4300",
    "build": "next build",
    "start": "next start -p 4300",
    "test": "node --import tsx --test \"lib/**/*.test.ts\"",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@reservation-platform/sdk": "workspace:*",
    "next": "^16.1.1",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "server-only": "^0.0.1"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tsx": "^4.21.0",
    "typescript": "^5"
  }
}
```

Then run:

`pnpm --filter @reservation-platform/console run test`

Expected: FAIL because `platform-client-config.ts` is missing.

- [ ] **Step 3: Implement the server-only client and console shell**

Implement the pure config reader in `lib/platform-client-config.ts`:

```ts
export interface ConsolePlatformConfig {
  baseUrl: string;
  apiKey: string;
  tenantId: string;
  venueId: string;
}

export function readConsolePlatformConfig(
  env: Record<string, string | undefined>,
): ConsolePlatformConfig {
  return {
    baseUrl: required(env.RESERVATION_PLATFORM_BASE_URL, "RESERVATION_PLATFORM_BASE_URL"),
    apiKey: required(env.RESERVATION_PLATFORM_SERVICE_API_KEY, "RESERVATION_PLATFORM_SERVICE_API_KEY"),
    tenantId: required(env.RESERVATION_CONSOLE_TENANT_ID, "RESERVATION_CONSOLE_TENANT_ID"),
    venueId: required(env.RESERVATION_CONSOLE_VENUE_ID, "RESERVATION_CONSOLE_VENUE_ID"),
  };
}

function required(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required for the owner console.`);
  return normalized;
}
```

At the top of `lib/platform-client.ts`, add `import "server-only";`. Export:

```ts
export function createConsolePlatformClient(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  const { baseUrl, apiKey, tenantId, venueId } = readConsolePlatformConfig(env);
  return createReservationPlatformClient({
    baseUrl,
    tenantId,
    venueId,
    getAccessToken: () => apiKey,
    fetch: fetchImpl,
  });
}
```

`app/page.tsx` is a server component that loads `getExperienceWorkspace()` and shows business name, preset, draft state, and publication state. `app/studio/page.tsx` loads `listExperiencePresets()` and shows the eight read-only cards plus the current selection. Catch configuration errors and render `SetupError`; do not print secret values.

`ConsoleShell` renders links only for Overview and Studio in Phase 1. Later sections are listed as disabled text with their approved labels, preventing broken routes. Add responsive CSS with a sidebar above 900px and stacked navigation below it.

Add root scripts:

```json
"dev:console": "pnpm --filter @reservation-platform/console run dev",
"console:build": "pnpm --filter @reservation-platform/console run build",
"console:typecheck": "pnpm --filter @reservation-platform/console run typecheck"
```

- [ ] **Step 4: Run console and frontend boundary checks**

Run:

```bash
pnpm --filter @reservation-platform/console run test
pnpm --filter @reservation-platform/console run typecheck
pnpm --filter @reservation-platform/console run build
pnpm run packages:verify-boundaries
```

Expected: all commands PASS and no server secret appears in `.next/static` (`rg 'server-secret|RESERVATION_PLATFORM_SERVICE_API_KEY' apps/console/.next/static` returns no matches).

- [ ] **Step 5: Commit the console shell**

```bash
git add apps/console package.json pnpm-lock.yaml
git commit -m "feat(console): add owner experience shell"
```

Include `pnpm-lock.yaml` only if pnpm changes it after adding the workspace package dependencies.

---

### Task 9: Add Phase 1 integration proof and documentation

**Files:**
- Create: `tests/e2e/console-foundation.e2e.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 6 routes, Task 7 SDK, Task 8 console.
- Produces: static boundary proof, optional live page proof, and exact startup contract.

- [ ] **Step 1: Write the E2E foundation proof**

```ts
test("console uses SDK with server-only platform configuration", async () => {
  const root = path.resolve("apps/console");
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const clientSource = await readFile(path.join(root, "lib/platform-client.ts"), "utf8");
  assert.equal(packageJson.dependencies["@reservation-platform/sdk"], "workspace:*");
  assert.match(clientSource, /import "server-only"/u);
  assert.match(clientSource, /RESERVATION_PLATFORM_SERVICE_API_KEY/u);
  assert.doesNotMatch(clientSource, /NEXT_PUBLIC_.*(?:KEY|SECRET|TOKEN)/u);
  assert.doesNotMatch(clientSource, /@supabase\/supabase-js/u);
});

test("console responds when a live URL is configured", async (context) => {
  const url = process.env.RESERVATION_CONSOLE_E2E_BASE_URL;
  if (!url) return context.skip("Set RESERVATION_CONSOLE_E2E_BASE_URL for the live proof.");
  const response = await fetch(new URL("/", url), { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Overview|Experience Studio|configuration required/iu);
});
```

- [ ] **Step 2: Run the new proof before documentation**

Run: `pnpm exec node --import tsx --test tests/e2e/console-foundation.e2e.ts`

Expected: static test PASSes; live test SKIPs unless its URL is configured.

- [ ] **Step 3: Document exact startup configuration**

Add this server-only console environment contract to `README.md`:

```env
RESERVATION_PLATFORM_BASE_URL=http://localhost:4100
RESERVATION_PLATFORM_SERVICE_API_KEY=replace-with-local-service-key
RESERVATION_CONSOLE_TENANT_ID=platform_default
RESERVATION_CONSOLE_VENUE_ID=00000000-0000-0000-0000-000000000001
```

Document `pnpm run dev:console`, port 4300, and state explicitly that the console key is read only by Next.js server code.

- [ ] **Step 4: Run the Phase 1 verification gate**

Run in this order:

```bash
pnpm --filter @reservation-platform/contract-types run test
pnpm --filter @reservation-platform/api run test
pnpm --filter @project-play/reservations-supabase run test
pnpm --filter @reservation-platform/database run test
pnpm --filter @reservation-platform/sdk run test
pnpm --filter @reservation-platform/standalone-api-skeleton run test
pnpm --filter @reservation-platform/console run test
pnpm --filter @reservation-platform/console run build
pnpm run packages:verify-boundaries
pnpm run database:verify-migration-bundle
pnpm run test:e2e
git diff --check
```

Expected: every command PASSes; optional live E2E checks may SKIP only when their documented URLs are absent.

- [ ] **Step 5: Commit the Phase 1 proof**

```bash
git add tests/e2e/console-foundation.e2e.ts README.md
git commit -m "test: add experience foundation proof"
```

---

## Phase 1 Completion Gate

Do not begin the Phase 2 Studio editor plan until all of these are true:

- Contract artifacts include the experience types and routes.
- The preset registry has exactly eight immutable entries.
- Migration bundle 000001–000015 verifies in order.
- A tenant/venue-scoped business profile and one draft can be stored and loaded.
- Publishing is atomic and public reads expose only published fields.
- Owner routes require authentication plus tenant and venue context.
- SDK methods match the route contract.
- Console builds with all credentials confined to server code.
- All commands in Task 9 Step 4 pass.
- The working tree contains no accidental generated files or unrelated staged changes.
