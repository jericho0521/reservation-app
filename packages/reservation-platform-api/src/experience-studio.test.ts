import assert from "node:assert/strict";
import test from "node:test";
import type {
  BusinessProfileResponse,
  ExperienceConfigurationResponse,
  ExperienceDraftInput,
  ExperienceWorkspaceResponse,
} from "@reservation-platform/contract-types";
import {
  publishExperienceDraft,
  readExperienceWorkspace,
  readPublicExperience,
  saveExperienceDraft,
  updateExperienceIdentity,
  type ExperienceScope,
  type ExperienceStudioRepository,
} from "./experience-studio.js";

const scope: ExperienceScope = { tenantId: "tenant_1", venueId: "venue_1" };

function profileFixture(): BusinessProfileResponse {
  return {
    business_id: "business_1",
    tenant_id: "tenant_1",
    venue_id: "venue_1",
    name: "Apex Racing",
    public_slug: "apex-racing",
    preset_id: "racing_gaming",
    status: "published",
  };
}

function configurationFixture(
  state: ExperienceConfigurationResponse["state"] = "draft",
): ExperienceConfigurationResponse {
  return {
    configuration_id: state === "draft" ? "draft_1" : "published_1",
    business_id: "business_1",
    version: state === "draft" ? 2 : 1,
    state,
    preset_id: "racing_gaming",
    branding: { brand_name: "Apex Racing", primary_color: "#f59e0b" },
    terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
    channels: { web_booking: true, web_chat: false, whatsapp: false },
    updated_at: "2026-07-13T00:00:00.000Z",
    ...(state === "published" ? { published_at: "2026-07-13T00:00:00.000Z" } : {}),
  };
}

function workspaceFixture(): ExperienceWorkspaceResponse {
  return {
    profile: profileFixture(),
    draft: configurationFixture("draft"),
    published: configurationFixture("published"),
  };
}

function validDraft(): ExperienceDraftInput {
  return {
    preset_id: "racing_gaming",
    branding: { brand_name: "Apex Racing", primary_color: "#f59e0b" },
    terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
    channels: { web_booking: true, web_chat: false, whatsapp: false },
  };
}

function fakeExperienceRepository(
  overrides: Partial<ExperienceStudioRepository> = {},
): ExperienceStudioRepository {
  return {
    readWorkspace: async () => workspaceFixture(),
    saveDraft: async () => workspaceFixture(),
    publishDraft: async () => ({
      ...workspaceFixture(),
      draft: undefined,
      published: { ...configurationFixture("published"), configuration_id: "draft_1", version: 2 },
    }),
    updateIdentity: async () => workspaceFixture(),
    readPublishedBySlug: async () => ({
      profile: profileFixture(),
      configuration: configurationFixture("published"),
    }),
    ...overrides,
  };
}

test("save rejects an invalid draft before repository work", async () => {
  let saved = false;
  const repository = fakeExperienceRepository({
    async saveDraft() {
      saved = true;
      throw new Error("must not run");
    },
  });
  const result = await saveExperienceDraft({
    scope,
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
  assert.equal("error" in result.body && result.body.error.code, "validation_failed");
});

test("public read omits tenant and venue identifiers", async () => {
  const result = await readPublicExperience({
    slug: "apex-racing",
    repository: fakeExperienceRepository(),
  });

  assert.equal(result.status, 200);
  assert.equal("tenant_id" in result.body.profile, false);
  assert.equal("venue_id" in result.body.profile, false);
  assert.equal(result.body.configuration.state, "published");
});

test("owner reads reject missing scope before repository work", async () => {
  let read = false;
  const result = await readExperienceWorkspace({
    scope: { tenantId: " ", venueId: "venue_1" },
    repository: fakeExperienceRepository({
      readWorkspace: async () => {
        read = true;
        return workspaceFixture();
      },
    }),
  });

  assert.equal(result.status, 400);
  assert.equal(read, false);
});

test("publish rejects a workspace without a draft as conflict", async () => {
  const workspace = workspaceFixture();
  delete workspace.draft;
  const result = await publishExperienceDraft({
    scope,
    configurationId: "draft_1",
    repository: fakeExperienceRepository({ readWorkspace: async () => workspace }),
  });

  assert.equal(result.status, 409);
  assert.equal("error" in result.body && result.body.error.code, "conflict");
});

test("storage failures are sanitized", async () => {
  const result = await saveExperienceDraft({
    scope,
    input: validDraft(),
    repository: fakeExperienceRepository({
      saveDraft: async () => {
        throw new Error("postgres password leaked");
      },
    }),
  });

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, {
    error: {
      code: "internal_error",
      message: "Failed to save experience draft.",
      status: 500,
    },
  });
});

test("identity updates reject unsafe slugs before repository work", async () => {
  let updated = false;
  const result = await updateExperienceIdentity({
    scope,
    input: {
      name: "Apex Racing",
      public_slug: "Apex Racing",
      branding: { brand_name: "Apex Racing" },
      terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
    },
    repository: fakeExperienceRepository({
      updateIdentity: async () => {
        updated = true;
        return workspaceFixture();
      },
    }),
  });

  assert.equal(result.status, 400);
  assert.equal(updated, false);
});
