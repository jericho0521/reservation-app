import type {
  ExperienceKnowledgeRepository,
  ExperienceScope,
} from "@reservation-platform/api";
import type { ExperienceKnowledgeInput } from "@reservation-platform/contract-types";

export const EXPERIENCE_KNOWLEDGE_TABLE = "platform_experience_knowledge";
export const EXPERIENCE_KNOWLEDGE_SELECT = "id, tenant_id, venue_id, question, answer, source, status, created_at, updated_at";

type QueryResult = { data: unknown; error: unknown | null };
interface KnowledgeQueryBuilder extends PromiseLike<QueryResult> {
  select(columns?: string): KnowledgeQueryBuilder;
  eq(column: string, value: unknown): KnowledgeQueryBuilder;
  order(column: string, options?: Record<string, unknown>): KnowledgeQueryBuilder;
  insert(rows: unknown): KnowledgeQueryBuilder;
  update(row: unknown): KnowledgeQueryBuilder;
  single(): Promise<QueryResult>;
}
export interface ExperienceKnowledgeSupabaseClient {
  from(table: string): KnowledgeQueryBuilder;
}

export function createSupabaseExperienceKnowledgeRepository(
  client: ExperienceKnowledgeSupabaseClient,
): ExperienceKnowledgeRepository {
  return {
    async list(scope, options = {}) {
      let query = scoped(client.from(EXPERIENCE_KNOWLEDGE_TABLE)
        .select(EXPERIENCE_KNOWLEDGE_SELECT), scope);
      if (!options.includeArchived) query = query.eq("status", "active");
      const result = await query.order("question").order("id") as QueryResult;
      return {
        data: Array.isArray(result.data) ? result.data.map(adaptKnowledgeRow) : [],
        ...(result.error ? { error: result.error } : {}),
      };
    },

    async create(scope, input) {
      const result = await client.from(EXPERIENCE_KNOWLEDGE_TABLE)
        .insert([knowledgeMutationRow(scope, input)])
        .select(EXPERIENCE_KNOWLEDGE_SELECT)
        .single();
      return adaptMutationResult(result);
    },

    async update(scope, id, input) {
      const result = await scoped(client.from(EXPERIENCE_KNOWLEDGE_TABLE)
        .update(knowledgeMutationRow(undefined, input))
        .eq("id", id), scope)
        .select(EXPERIENCE_KNOWLEDGE_SELECT)
        .single();
      return adaptMutationResult(result);
    },

    async archive(scope, id) {
      const result = await scoped(client.from(EXPERIENCE_KNOWLEDGE_TABLE)
        .update({ status: "archived" })
        .eq("id", id), scope)
        .select(EXPERIENCE_KNOWLEDGE_SELECT)
        .single();
      return adaptMutationResult(result);
    },
  };
}

function scoped(query: KnowledgeQueryBuilder, scope: ExperienceScope) {
  return query.eq("tenant_id", scope.tenantId).eq("venue_id", scope.venueId);
}

function knowledgeMutationRow(
  scope: ExperienceScope | undefined,
  input: ExperienceKnowledgeInput,
) {
  return {
    ...(scope ? { tenant_id: scope.tenantId, venue_id: scope.venueId, status: "active" } : {}),
    question: input.question,
    answer: input.answer,
    source: input.source ?? null,
  };
}

function adaptMutationResult(result: QueryResult) {
  return {
    data: result.data ? adaptKnowledgeRow(result.data) : null,
    ...(result.error ? { error: result.error } : {}),
  };
}

function adaptKnowledgeRow(value: unknown) {
  if (!isRecord(value)) return value;
  return {
    knowledge_id: value.id,
    tenant_id: value.tenant_id,
    venue_id: value.venue_id,
    question: value.question,
    answer: value.answer,
    ...(typeof value.source === "string" ? { source: value.source } : {}),
    status: value.status,
    ...(typeof value.created_at === "string" ? { created_at: value.created_at } : {}),
    ...(typeof value.updated_at === "string" ? { updated_at: value.updated_at } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
