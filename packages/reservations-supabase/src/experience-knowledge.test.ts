import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabaseExperienceKnowledgeRepository,
  EXPERIENCE_KNOWLEDGE_SELECT,
  EXPERIENCE_KNOWLEDGE_TABLE,
} from "./experience-knowledge.js";

test("experience knowledge repository scopes reads and archive writes", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const rows = [{
    id: "knowledge_1",
    tenant_id: "tenant_1",
    venue_id: "venue_1",
    question: "Hours?",
    answer: "Nine to five.",
    status: "active",
  }];
  const client = fakeClient([
    { data: rows, error: null },
    { data: { ...rows[0], status: "archived" }, error: null },
  ], calls);
  const repository = createSupabaseExperienceKnowledgeRepository(client);
  const scope = { tenantId: "tenant_1", venueId: "venue_1" };

  const listed = await repository.list(scope);
  const archived = await repository.archive(scope, "knowledge_1");

  assert.deepEqual(listed.data, [{
    knowledge_id: "knowledge_1",
    tenant_id: "tenant_1",
    venue_id: "venue_1",
    question: "Hours?",
    answer: "Nine to five.",
    status: "active",
  }]);
  assert.equal((archived.data as { status: string }).status, "archived");
  assert.deepEqual(calls, [
    {
      table: EXPERIENCE_KNOWLEDGE_TABLE,
      select: EXPERIENCE_KNOWLEDGE_SELECT,
      filters: [
        { column: "tenant_id", value: "tenant_1" },
        { column: "venue_id", value: "venue_1" },
        { column: "status", value: "active" },
      ],
      orders: ["question", "id"],
    },
    {
      table: EXPERIENCE_KNOWLEDGE_TABLE,
      select: EXPERIENCE_KNOWLEDGE_SELECT,
      update: { status: "archived" },
      filters: [
        { column: "id", value: "knowledge_1" },
        { column: "tenant_id", value: "tenant_1" },
        { column: "venue_id", value: "venue_1" },
      ],
      orders: [],
      single: true,
    },
  ]);
});

function fakeClient(results: Array<{ data: unknown; error: null }>, calls: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      const call: Record<string, unknown> = { table, filters: [], orders: [] };
      calls.push(call);
      const result = Promise.resolve(results.shift() ?? { data: null, error: null });
      return {
        select(columns?: string) { call.select = columns; return this; },
        eq(column: string, value: unknown) { (call.filters as unknown[]).push({ column, value }); return this; },
        order(column: string) { (call.orders as string[]).push(column); return this; },
        insert(rows: unknown) { call.insert = rows; return this; },
        update(row: unknown) { call.update = row; return this; },
        single() { call.single = true; return result; },
        then(resolve: (value: { data: unknown; error: null }) => unknown) { return result.then(resolve); },
      };
    },
  };
}
