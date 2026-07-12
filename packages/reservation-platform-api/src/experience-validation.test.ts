import assert from "node:assert/strict";
import test from "node:test";
import { validateExperienceWorkspace, type ExperienceValidationDependencies } from "./experience-validation.js";

const scope = { tenantId: "tenant_1", venueId: "venue_1" };

test("experience validation reports each required Studio section", async () => {
  const dependencies = validationDependencies({ empty: true });
  const result = await validateExperienceWorkspace({ scope, dependencies });

  assert.equal(result.status, 200);
  assert.deepEqual("issues" in result.body ? result.body.issues.map((issue) => issue.path) : [], [
    "services",
    "availability.intervals",
    "knowledge.entries",
    "channels.web_chat",
  ]);
});

test("experience validation passes a complete ready workspace", async () => {
  const result = await validateExperienceWorkspace({ scope, dependencies: validationDependencies() });
  assert.deepEqual(result, { status: 200, body: { valid: true, issues: [] } });
});

function validationDependencies({ empty = false } = {}): ExperienceValidationDependencies {
  const workspace = {
    profile: {
      business_id: "business_1",
      tenant_id: "tenant_1",
      venue_id: "venue_1",
      name: "Apex",
      public_slug: "apex",
      preset_id: "racing_gaming" as const,
      status: "draft" as const,
    },
    draft: {
      configuration_id: "configuration_1",
      business_id: "business_1",
      version: 1,
      state: "draft" as const,
      preset_id: "racing_gaming" as const,
      branding: { brand_name: "Apex", primary_color: "#f59e0b" },
      terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
      channels: { web_booking: true, web_chat: true, whatsapp: false },
      updated_at: "2026-07-13T00:00:00.000Z",
    },
  };
  return {
    studioRepository: {
      readWorkspace: async () => workspace,
      saveDraft: async () => workspace,
      publishDraft: async () => workspace,
      updateIdentity: async () => workspace,
      readPublishedBySlug: async () => undefined,
    },
    catalogRepository: {
      listVenues: async () => ({ data: [] }),
      getVenue: async () => ({ data: null }),
      listServices: async () => ({ data: empty ? [] : [{ id: "service_1", name: "Session", selection_mode: "assigned_resource" }] }),
      getService: async () => ({ data: null }),
      listResources: async () => ({ data: empty ? [] : [{ id: "resource_1", service_id: "service_1", label: "Rig 1", status: "available", resource_kind: "station" }] }),
      getResource: async () => ({ data: null }),
      getResourceLayout: async () => ({ data: null }),
    },
    operatingHoursRepository: {
      read: async () => ({ data: empty ? null : {
        tenant_id: "tenant_1",
        venue_id: "venue_1",
        timezone: "Asia/Kuala_Lumpur",
        booking_horizon_days: 60,
        slot_interval_minutes: 30,
        minimum_notice_minutes: 120,
        intervals: [{ day_of_week: 1, start_time: "09:00", end_time: "17:00" }],
        closures: [],
      } }),
      replace: async () => ({ data: null }),
    },
    knowledgeRepository: {
      list: async () => ({ data: empty ? [] : [{}] }),
      create: async () => ({ data: null }),
      update: async () => ({ data: null }),
      archive: async () => ({ data: null }),
    },
    channelReadiness: {
      web_booking: { configured: true, ready: true },
      web_chat: { configured: !empty, ready: !empty },
      whatsapp: { configured: false, ready: false },
    },
  };
}
