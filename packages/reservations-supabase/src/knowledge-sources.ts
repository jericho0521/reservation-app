import type { ExperienceScope, KnowledgeSourceRepository } from "@reservation-platform/api";

type QueryResult = { data: unknown; error: unknown | null };
interface QueryBuilder extends PromiseLike<QueryResult> {
  select(columns?: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  neq(column: string, value: unknown): QueryBuilder;
  order(column: string, options?: Record<string, unknown>): QueryBuilder;
  insert(rows: unknown): QueryBuilder;
  update(row: unknown): QueryBuilder;
  maybeSingle(): Promise<QueryResult>;
  single(): Promise<QueryResult>;
}
export interface KnowledgeSourcesSupabaseClient {
  from(table: string): QueryBuilder;
  rpc(name: string, params?: Record<string, unknown>): Promise<QueryResult>;
}

const table = "platform_knowledge_sources";
const select = "id, tenant_id, venue_id, kind, title, source_label, status, chunk_count, indexed_at, failure_code, created_at, updated_at";

export function createSupabaseKnowledgeSourceRepository(
  client: KnowledgeSourcesSupabaseClient,
): KnowledgeSourceRepository {
  return {
    async list(scope, includeArchived = false) {
      let query = scoped(client.from(table).select(select), scope);
      if (!includeArchived) query = query.neq("status", "archived");
      const result = await query.order("updated_at", { ascending: false }) as QueryResult;
      return { data: Array.isArray(result.data) ? result.data.map(adapt) : [], ...(result.error ? { error: result.error } : {}) };
    },
    async create(scope, input) {
      const result = await client.rpc("platform_create_knowledge_source", {
        p_tenant_id: scope.tenantId,
        p_venue_id: scope.venueId,
        p_kind: input.kind,
        p_title: input.title,
        p_source_label: input.source_label,
        p_normalized_content: input.content,
        p_content_sha256: input.contentSha256,
      });
      const row = first(result.data);
      return { data: row ? adapt(row) : undefined, ...(result.error ? { error: result.error } : {}) };
    },
    async replace(scope, sourceId, input) {
      const result = await client.rpc("platform_replace_knowledge_source", {
        p_tenant_id: scope.tenantId,
        p_venue_id: scope.venueId,
        p_source_id: sourceId,
        p_kind: input.kind,
        p_title: input.title,
        p_source_label: input.source_label,
        p_normalized_content: input.content,
        p_content_sha256: input.contentSha256,
      });
      const row = first(result.data);
      return { data: row ? adapt(row) : undefined, ...(result.error ? { error: result.error } : {}) };
    },
    async archive(scope, sourceId) {
      const result = await client.rpc("platform_archive_knowledge_source", {
        p_tenant_id: scope.tenantId,
        p_venue_id: scope.venueId,
        p_source_id: sourceId,
      });
      const row = first(result.data);
      return { data: row ? adapt(row) : undefined, ...(result.error ? { error: result.error } : {}) };
    },
    async reindex(scope, sourceId) {
      const result = await client.rpc("platform_reindex_knowledge_source", {
        p_tenant_id: scope.tenantId,
        p_venue_id: scope.venueId,
        p_source_id: sourceId,
      });
      const row = first(result.data);
      return { data: row ? adapt(row) : undefined, ...(result.error ? { error: result.error } : {}) };
    },
    async testSearch(scope, query) {
      const enqueued = await client.rpc("platform_enqueue_knowledge_search_test", {
        p_tenant_id: scope.tenantId,
        p_venue_id: scope.venueId,
        p_query: query,
      });
      if (enqueued.error || typeof enqueued.data !== "string") {
        return { error: enqueued.error ?? new Error("Knowledge search test could not be queued.") };
      }
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const result = await scoped(
          client.from("platform_knowledge_search_tests")
            .select("status, matches, failure_code")
            .eq("id", enqueued.data),
          scope,
        ).maybeSingle();
        if (result.error) return { error: result.error };
        const row = result.data ? asRecord(result.data) : {};
        if (row.status === "ready") return { data: { matches: Array.isArray(row.matches) ? row.matches : [] } };
        if (row.status === "failed") return { error: new Error("Knowledge search test failed.") };
        await delay(250);
      }
      return { error: new Error("Knowledge search test timed out.") };
    },
  };
}

function scoped(query: QueryBuilder, scope: ExperienceScope) {
  return query.eq("tenant_id", scope.tenantId).eq("venue_id", scope.venueId);
}
function first(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}
function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
function adapt(value: unknown) {
  const row = asRecord(value);
  return {
    source_id: row.id,
    kind: row.kind,
    title: row.title,
    source_label: row.source_label,
    status: row.status,
    chunk_count: Number(row.chunk_count),
    ...(typeof row.indexed_at === "string" ? { indexed_at: row.indexed_at } : {}),
    ...(typeof row.failure_code === "string" ? { failure_code: row.failure_code } : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
