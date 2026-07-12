import assert from "node:assert/strict";
import test from "node:test";
import type { ExperienceStudioRepository } from "./experience-studio.js";
import {
  archiveExperienceKnowledge,
  createExperienceKnowledge,
  listExperienceKnowledge,
  readExperienceChannelSettings,
  updateExperienceChannelSettings,
  type ExperienceKnowledgeRepository,
} from "./experience-knowledge.js";

const scope = { tenantId: "tenant_1", venueId: "venue_1" };

test("experience knowledge list is scoped, deterministically ordered, and includes archived only for owners", async () => {
  let observed: unknown;
  const result = await listExperienceKnowledge({
    scope,
    includeArchived: true,
    repository: knowledgeRepository({
      async list(actualScope, options) {
        observed = { scope: actualScope, options };
        return { data: [knowledgeEntry("b", "Parking"), knowledgeEntry("a", "Hours")] };
      },
    }),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(observed, { scope, options: { includeArchived: true } });
  assert.deepEqual("entries" in result.body ? result.body.entries.map((entry) => entry.question) : [], ["Hours", "Parking"]);
});

test("experience knowledge validates before storage and archives instead of deleting", async () => {
  let archives = 0;
  const repository = knowledgeRepository({
    async archive(actualScope, id) {
      archives += 1;
      return { data: { ...knowledgeEntry(id, "Hours"), status: "archived", tenant_id: actualScope.tenantId, venue_id: actualScope.venueId } };
    },
  });

  const invalid = await createExperienceKnowledge({
    scope,
    value: { question: "", answer: "" },
    repository,
  });
  const archived = await archiveExperienceKnowledge({ scope, knowledgeId: "knowledge_1", repository });

  assert.equal(invalid.status, 400);
  assert.equal(archived.status, 200);
  assert.equal(archives, 1);
  assert.equal("status" in archived.body ? archived.body.status : undefined, "archived");
});

test("channel settings report desired enablement separately from runtime readiness", async () => {
  const repository = studioRepository();
  const readiness = {
    web_booking: { configured: true, ready: true },
    web_chat: { configured: false, ready: false, message: "Configure an AI provider." },
    whatsapp: { configured: true, ready: false, message: "Connect WhatsApp." },
  };

  const read = await readExperienceChannelSettings({ scope, repository, readiness });
  const updated = await updateExperienceChannelSettings({
    scope,
    value: { web_booking: true, web_chat: true, whatsapp: true },
    repository,
    readiness,
  });

  assert.equal(read.status, 200);
  assert.equal(updated.status, 200);
  if ("readiness" in updated.body) {
    assert.deepEqual(updated.body.readiness.web_chat, {
      desired_enabled: true,
      configured: false,
      ready: false,
      state: "not_configured",
      message: "Configure an AI provider.",
    });
    assert.equal(updated.body.readiness.whatsapp.state, "degraded");
  }
});

function knowledgeEntry(id: string, question: string) {
  return {
    knowledge_id: id,
    tenant_id: "tenant_1",
    venue_id: "venue_1",
    question,
    answer: `${question} answer`,
    status: "active" as const,
  };
}

function knowledgeRepository(overrides: Partial<ExperienceKnowledgeRepository> = {}): ExperienceKnowledgeRepository {
  return {
    list: async () => ({ data: [] }),
    create: async (_scope, input) => ({ data: { ...knowledgeEntry("knowledge_1", input.question), ...input } }),
    update: async (_scope, id, input) => ({ data: { ...knowledgeEntry(id, input.question), ...input } }),
    archive: async (_scope, id) => ({ data: { ...knowledgeEntry(id, "Archived"), status: "archived" } }),
    ...overrides,
  };
}

function studioRepository(): ExperienceStudioRepository {
  const workspace = (channels = { web_booking: true, web_chat: false, whatsapp: false }) => ({
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
      branding: { brand_name: "Apex" },
      terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
      channels,
      updated_at: "2026-07-13T00:00:00.000Z",
    },
  });
  return {
    readWorkspace: async () => workspace(),
    saveDraft: async () => workspace(),
    publishDraft: async () => workspace(),
    updateIdentity: async () => workspace(),
    updateChannels: async (_scope, channels) => workspace(channels),
    readPublishedBySlug: async () => undefined,
  };
}
