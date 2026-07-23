import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseExperienceStudioRepository } from "./experience-studio.js";

type Result = { data: unknown; error: Record<string, unknown> | null };

function profileRow() {
  return {
    id: "business_1",
    tenant_id: "tenant_1",
    venue_id: "venue_1",
    name: "Apex Racing",
    public_slug: "apex-racing",
    preset_id: "racing_gaming",
    status: "published",
  };
}

function configurationRow(state = "draft") {
  return {
    id: state === "draft" ? "config_1" : "published_1",
    business_id: "business_1",
    version: state === "draft" ? 2 : 1,
    state,
    preset_id: "racing_gaming",
    branding: { brand_name: "Apex Racing", primary_color: "#f59e0b" },
    terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
    channels: { web_booking: true, web_chat: false, whatsapp: false },
    updated_at: "2026-07-13T00:00:00.000Z",
    published_at: state === "published" ? "2026-07-13T00:00:00.000Z" : null,
  };
}

function fakeClient(
  calls: Array<[string, unknown]>,
  results: Result[],
) {
  return {
    from(table: string) {
      calls.push(["from", table]);
      const result = Promise.resolve(results.shift() ?? { data: null, error: null });
      const builder = {
        select(columns?: string) { calls.push(["select", columns]); return builder; },
        eq(column: string, value: unknown) { calls.push(["eq", [column, value]]); return builder; },
        order(column: string, options?: unknown) { calls.push(["order", [column, options]]); return builder; },
        limit(count: number) { calls.push(["limit", count]); return builder; },
        insert(rows: unknown) { calls.push(["insert", rows]); return builder; },
        upsert(row: unknown, options?: unknown) { calls.push(["upsert", [row, options]]); return builder; },
        update(row: unknown) { calls.push(["update", row]); return builder; },
        single() { calls.push(["single", null]); return result; },
        maybeSingle() { calls.push(["maybeSingle", null]); return result; },
        then(resolve: (value: Result) => unknown) { return result.then(resolve); },
      };
      return builder;
    },
  };
}

test("experience repository scopes workspace reads to tenant and venue", async () => {
  const calls: Array<[string, unknown]> = [];
  const repository = createSupabaseExperienceStudioRepository(fakeClient(calls, [
    { data: profileRow(), error: null },
    { data: [configurationRow("draft"), configurationRow("published")], error: null },
  ]));

  const workspace = await repository.readWorkspace({ tenantId: "tenant_1", venueId: "venue_1" });

  assert.equal(workspace?.profile.tenant_id, "tenant_1");
  assert.deepEqual(calls.filter(([name]) => name === "eq").slice(0, 2), [
    ["eq", ["tenant_id", "tenant_1"]],
    ["eq", ["venue_id", "venue_1"]],
  ]);
  assert.equal(workspace?.draft?.configuration_id, "config_1");
  assert.equal(workspace?.published?.configuration_id, "published_1");
});

test("experience repository accepts the default seat-capacity preset", async () => {
  const profile = { ...profileRow(), preset_id: "seat_capacity" };
  const configuration = { ...configurationRow(), preset_id: "seat_capacity" };
  const repository = createSupabaseExperienceStudioRepository(fakeClient([], [
    { data: profile, error: null },
    { data: [configuration], error: null },
  ]));

  const workspace = await repository.readWorkspace({ tenantId: "tenant_1", venueId: "venue_1" });

  assert.equal(workspace?.profile.preset_id, "seat_capacity");
  assert.equal(workspace?.draft?.preset_id, "seat_capacity");
});

test("publish uses the atomic scoped RPC", async () => {
  const rpcCalls: unknown[] = [];
  const tableCalls: Array<[string, unknown]> = [];
  const client = {
    ...fakeClient(tableCalls, [
      { data: profileRow(), error: null },
      { data: [configurationRow("published")], error: null },
    ]),
    async rpc(name: string, params: unknown) {
      rpcCalls.push([name, params]);
      return { data: configurationRow("published"), error: null };
    },
  };
  const repository = createSupabaseExperienceStudioRepository(client);

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

test("malformed configuration JSON is rejected", async () => {
  const repository = createSupabaseExperienceStudioRepository(fakeClient([], [
    { data: profileRow(), error: null },
    { data: [{ ...configurationRow(), branding: [] }], error: null },
  ]));

  await assert.rejects(
    repository.readWorkspace({ tenantId: "tenant_1", venueId: "venue_1" }),
    /Experience configuration row is invalid\./,
  );
});

test("save preserves an existing draft version", async () => {
  const calls: Array<[string, unknown]> = [];
  const repository = createSupabaseExperienceStudioRepository(fakeClient(calls, [
    { data: profileRow(), error: null },
    { data: profileRow(), error: null },
    { data: [configurationRow("draft"), configurationRow("published")], error: null },
    { data: configurationRow("draft"), error: null },
    { data: profileRow(), error: null },
    { data: [configurationRow("draft"), configurationRow("published")], error: null },
  ]));

  await repository.saveDraft(
    { tenantId: "tenant_1", venueId: "venue_1" },
    {
      preset_id: "racing_gaming",
      branding: { brand_name: "New Marketing Name" },
      terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
      channels: { web_booking: true, web_chat: false, whatsapp: false },
    },
  );

  const configurationUpsert = calls.filter(([name]) => name === "upsert")[1][1] as [
    Record<string, unknown>,
    unknown,
  ];
  const profileUpsert = calls.filter(([name]) => name === "upsert")[0][1] as [
    Record<string, unknown>,
    unknown,
  ];
  assert.equal(profileUpsert[0].name, "Apex Racing");
  assert.equal(profileUpsert[0].public_slug, "apex-racing");
  assert.equal(configurationUpsert[0].id, "config_1");
  assert.equal(configurationUpsert[0].version, 2);
});

test("save creates a draft after the highest published version", async () => {
  const calls: Array<[string, unknown]> = [];
  const published = { ...configurationRow("published"), version: 4 };
  const draft = { ...configurationRow("draft"), id: "new_draft", version: 5 };
  const repository = createSupabaseExperienceStudioRepository(fakeClient(calls, [
    { data: profileRow(), error: null },
    { data: profileRow(), error: null },
    { data: [published], error: null },
    { data: draft, error: null },
    { data: profileRow(), error: null },
    { data: [draft, published], error: null },
  ]));

  const workspace = await repository.saveDraft(
    { tenantId: "tenant_1", venueId: "venue_1" },
    {
      preset_id: "racing_gaming",
      branding: { brand_name: "Apex Racing" },
      terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
      channels: { web_booking: true, web_chat: false, whatsapp: false },
    },
  );

  const configurationUpsert = calls.filter(([name]) => name === "upsert")[1][1] as [
    Record<string, unknown>,
    unknown,
  ];
  assert.equal(configurationUpsert[0].id, undefined);
  assert.equal(configurationUpsert[0].version, 5);
  assert.equal(workspace.draft?.version, 5);
});

test("public reads normalize slugs and require published rows", async () => {
  const calls: Array<[string, unknown]> = [];
  const repository = createSupabaseExperienceStudioRepository(fakeClient(calls, [
    { data: profileRow(), error: null },
    { data: configurationRow("published"), error: null },
  ]));

  const published = await repository.readPublishedBySlug("APEX-RACING");

  assert.equal(published?.configuration.state, "published");
  assert.deepEqual(calls.filter(([name]) => name === "eq").slice(0, 2), [
    ["eq", ["public_slug", "apex-racing"]],
    ["eq", ["status", "published"]],
  ]);
});

test("identity updates scope profile and draft writes", async () => {
  const calls: Array<[string, unknown]> = [];
  const updatedProfile = { ...profileRow(), name: "Apex", public_slug: "apex" };
  const updatedDraft = {
    ...configurationRow("draft"),
    branding: { brand_name: "Apex" },
  };
  const repository = createSupabaseExperienceStudioRepository(fakeClient(calls, [
    { data: profileRow(), error: null },
    { data: [configurationRow("draft")], error: null },
    { data: updatedProfile, error: null },
    { data: updatedDraft, error: null },
    { data: updatedProfile, error: null },
    { data: [updatedDraft], error: null },
  ]));

  const workspace = await repository.updateIdentity(
    { tenantId: "tenant_1", venueId: "venue_1" },
    {
      name: "Apex",
      public_slug: "apex",
      branding: { brand_name: "Apex" },
      terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
    },
  );

  assert.equal(workspace?.profile.public_slug, "apex");
  assert.deepEqual(calls.filter(([name]) => name === "update"), [
    ["update", { name: "Apex", public_slug: "apex" }],
    ["update", {
      branding: { brand_name: "Apex" },
      terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
    }],
  ]);
});

test("channel updates mutate only the scoped draft channel object", async () => {
  const calls: Array<[string, unknown]> = [];
  const updatedDraft = {
    ...configurationRow("draft"),
    channels: { web_booking: true, web_chat: true, whatsapp: true },
  };
  const repository = createSupabaseExperienceStudioRepository(fakeClient(calls, [
    { data: profileRow(), error: null },
    { data: [configurationRow("draft")], error: null },
    { data: updatedDraft, error: null },
    { data: profileRow(), error: null },
    { data: [updatedDraft], error: null },
  ]));

  const workspace = await repository.updateChannels!(
    { tenantId: "tenant_1", venueId: "venue_1" },
    { web_booking: true, web_chat: true, whatsapp: true },
  );

  assert.deepEqual(workspace?.draft?.channels, { web_booking: true, web_chat: true, whatsapp: true });
  assert.deepEqual(calls.filter(([name]) => name === "update"), [[
    "update",
    { channels: { web_booking: true, web_chat: true, whatsapp: true } },
  ]]);
  assert.equal(calls.some(([name, value]) => (
    name === "eq" && JSON.stringify(value) === JSON.stringify(["id", "config_1"])
  )), true);
});
