import assert from "node:assert/strict";
import test from "node:test";
import { experienceDraftInputSchema, type ExperiencePresetId, type ExperienceWorkspaceResponse } from "../../packages/contract-types/src/index.ts";
import {
  createExperienceDraftFromPreset,
  getExperiencePresetCatalogDefaults,
  listExperiencePresets,
  publishExperienceDraft,
  validateExperienceDraft,
  validateExperienceWorkspace,
  type ExperienceStudioRepository,
  type ExperienceValidationDependencies,
} from "../../packages/reservation-platform-api/src/index.ts";
import { createExperiencePreviewConfig } from "../../packages/reservation-ui/src/config.ts";

const expectedPresetIds: ExperiencePresetId[] = [
  "seat_capacity",
  "racing_gaming",
  "rooms_facilities",
  "appointments_salon",
  "sports_courts",
  "restaurant_tables",
  "cinema_events",
  "equipment_rental",
  "classes_workshops",
];

test("all nine presets create, validate, preview, and publish through shared platform paths", async () => {
  const presets = listExperiencePresets().presets;
  assert.deepEqual(presets.map((preset) => preset.preset_id), expectedPresetIds);

  for (const preset of presets) {
    const draft = experienceDraftInputSchema.parse(createExperienceDraftFromPreset(preset.preset_id));
    assert.deepEqual(validateExperienceDraft(draft), { valid: true, issues: [] }, preset.preset_id);

    const workspace: ExperienceWorkspaceResponse = {
      profile: {
        business_id: `business-${preset.preset_id}`,
        tenant_id: "tenant-demo",
        venue_id: "venue-demo",
        name: draft.branding.brand_name,
        public_slug: preset.preset_id.replaceAll("_", "-"),
        preset_id: preset.preset_id,
        status: "draft",
      },
      draft: {
        configuration_id: `draft-${preset.preset_id}`,
        business_id: `business-${preset.preset_id}`,
        version: 1,
        state: "draft",
        ...draft,
        updated_at: "2026-07-12T00:00:00.000Z",
      },
    };
    const repository = studioRepository(workspace);
    const validation = await validateExperienceWorkspace({
      scope: { tenantId: "tenant-demo", venueId: "venue-demo" },
      dependencies: validationDependencies(workspace, preset.resource_strategy),
    });
    assert.deepEqual(validation, { status: 200, body: { valid: true, issues: [] } }, preset.preset_id);

    const preview = createExperiencePreviewConfig(draft, [{
      service_id: `service-${preset.preset_id}`,
      name: `${preset.name} Demo`,
      resource_strategy: preset.resource_strategy,
    }]);
    assert.equal(preview.bookingLabel, preset.terminology.booking, preset.preset_id);
    assert.equal(preview.services.length, 1, preset.preset_id);

    const published = await publishExperienceDraft({
      scope: { tenantId: "tenant-demo", venueId: "venue-demo" },
      configurationId: workspace.draft!.configuration_id,
      repository,
    });
    assert.equal(published.status, 200, preset.preset_id);
    assert.equal("published" in published.body && published.body.published?.state, "published", preset.preset_id);
  }
});

test("only flagship presets define catalog defaults; remaining industries need no custom subsystem", () => {
  assert.ok(getExperiencePresetCatalogDefaults("racing_gaming"));
  assert.ok(getExperiencePresetCatalogDefaults("rooms_facilities"));
  assert.ok(getExperiencePresetCatalogDefaults("appointments_salon"));
  for (const presetId of expectedPresetIds.filter((presetId) => ![
    "racing_gaming",
    "rooms_facilities",
    "appointments_salon",
  ].includes(presetId))) {
    assert.equal(getExperiencePresetCatalogDefaults(presetId), undefined, presetId);
    assert.equal(validateExperienceDraft(createExperienceDraftFromPreset(presetId)).valid, true, presetId);
  }
});

function studioRepository(workspace: ExperienceWorkspaceResponse): ExperienceStudioRepository {
  return {
    readWorkspace: async () => workspace,
    saveDraft: async () => workspace,
    publishDraft: async () => ({
      profile: { ...workspace.profile, status: "published" },
      published: { ...workspace.draft!, state: "published", published_at: "2026-07-12T00:01:00.000Z" },
    }),
    updateIdentity: async () => workspace,
    readPublishedBySlug: async () => undefined,
  };
}

function validationDependencies(
  workspace: ExperienceWorkspaceResponse,
  strategy: "quantity" | "assigned_resource" | "hybrid",
): ExperienceValidationDependencies {
  const serviceId = `service-${workspace.profile.preset_id}`;
  return {
    studioRepository: studioRepository(workspace),
    catalogRepository: {
      listVenues: async () => ({ data: [] }),
      getVenue: async () => ({ data: null }),
      listServices: async () => ({ data: [{ id: serviceId, name: "Demo service", selection_mode: strategy }] }),
      getService: async () => ({ data: null }),
      listResources: async () => ({ data: strategy === "quantity" ? [] : [{ id: "resource-1", service_id: serviceId, label: "Resource 1", status: "available", resource_kind: "custom" }] }),
      getResource: async () => ({ data: null }),
      getResourceLayout: async () => ({ data: null }),
    },
    operatingHoursRepository: {
      read: async () => ({ data: {
        tenant_id: "tenant-demo",
        venue_id: "venue-demo",
        timezone: "Asia/Kuala_Lumpur",
        booking_horizon_days: 60,
        slot_interval_minutes: 30,
        minimum_notice_minutes: 60,
        intervals: [{ day_of_week: 1, start_time: "09:00", end_time: "17:00" }],
        closures: [],
      } }),
      replace: async () => ({ data: null }),
    },
    knowledgeRepository: {
      list: async () => ({ data: [] }),
      create: async () => ({ data: null }),
      update: async () => ({ data: null }),
      archive: async () => ({ data: null }),
    },
    channelReadiness: {
      web_booking: { configured: true, ready: true },
      web_chat: { configured: false, ready: false },
      whatsapp: { configured: false, ready: false },
    },
  };
}
