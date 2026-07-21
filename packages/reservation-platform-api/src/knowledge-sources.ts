import { createHash } from "node:crypto";
import {
  knowledgeSourceResponseSchema,
  knowledgeSearchTestInputSchema,
  knowledgeSearchTestResponseSchema,
  knowledgeTextSourceInputSchema,
  type KnowledgeSearchTestResponse,
  type KnowledgeSourceResponse,
  type KnowledgeTextSourceInput,
  type ListKnowledgeSourcesResponse,
} from "@reservation-platform/contract-types";
import { platformErrorBody } from "./errors.js";
import type { ExperienceScope } from "./experience-studio.js";

export interface KnowledgeSourceRepository {
  list(scope: ExperienceScope, includeArchived?: boolean): Promise<{ data?: unknown[]; error?: unknown }>;
  create(scope: ExperienceScope, input: KnowledgeTextSourceInput & {
    kind: "text" | "pdf";
    contentSha256: string;
  }): Promise<{ data?: unknown; error?: unknown }>;
  replace(scope: ExperienceScope, sourceId: string, input: KnowledgeTextSourceInput & {
    kind: "text" | "pdf";
    contentSha256: string;
  }): Promise<{ data?: unknown; error?: unknown }>;
  archive(scope: ExperienceScope, sourceId: string): Promise<{ data?: unknown; error?: unknown }>;
  reindex(scope: ExperienceScope, sourceId: string): Promise<{ data?: unknown; error?: unknown }>;
  testSearch(scope: ExperienceScope, query: string): Promise<{ data?: unknown; error?: unknown }>;
}

type KnowledgeSourceResult<T> = {
  status: number;
  body: T | ReturnType<typeof platformErrorBody>;
};

export async function listKnowledgeSources(input: {
  scope: ExperienceScope;
  repository: KnowledgeSourceRepository;
  includeArchived?: boolean;
}): Promise<KnowledgeSourceResult<ListKnowledgeSourcesResponse>> {
  try {
    const result = await input.repository.list(input.scope, input.includeArchived);
    if (result.error) throw result.error;
    return { status: 200, body: { sources: (result.data ?? []).map(parseSource) } };
  } catch {
    return failure(500, "internal_error", "Knowledge sources could not be loaded.");
  }
}

export async function createKnowledgeTextSource(input: {
  scope: ExperienceScope;
  value: unknown;
  repository: KnowledgeSourceRepository;
  kind?: "text" | "pdf";
}): Promise<KnowledgeSourceResult<KnowledgeSourceResponse>> {
  const parsed = parseKnowledgeSourceInput(input.value, input.kind ?? "text");
  if (!parsed) return failure(400, "validation_failed", "Knowledge source is invalid.");
  const normalized = normalizeKnowledgeContent(parsed.content);
  if (!normalized) return failure(422, "validation_failed", "Knowledge source contains no usable text.");
  try {
    const result = await input.repository.create(input.scope, {
      ...parsed,
      content: normalized,
      kind: input.kind ?? "text",
      contentSha256: createHash("sha256").update(normalized, "utf8").digest("hex"),
    });
    if (result.error) {
      if (isConflict(result.error)) return failure(409, "conflict", "This knowledge content already exists.");
      throw result.error;
    }
    return { status: 201, body: parseSource(result.data) };
  } catch {
    return failure(500, "internal_error", "Knowledge source could not be created.");
  }
}

export async function replaceKnowledgeSource(input: {
  scope: ExperienceScope;
  sourceId: string;
  value: unknown;
  repository: KnowledgeSourceRepository;
  kind?: "text" | "pdf";
}): Promise<KnowledgeSourceResult<KnowledgeSourceResponse>> {
  const parsed = parseKnowledgeSourceInput(input.value, input.kind ?? "text");
  if (!parsed) return failure(400, "validation_failed", "Knowledge source is invalid.");
  const normalized = normalizeKnowledgeContent(parsed.content);
  if (!normalized) return failure(422, "validation_failed", "Knowledge source contains no usable text.");
  try {
    const result = await input.repository.replace(input.scope, input.sourceId, {
      ...parsed,
      content: normalized,
      kind: input.kind ?? "text",
      contentSha256: createHash("sha256").update(normalized, "utf8").digest("hex"),
    });
    if (result.error) {
      if (isConflict(result.error)) return failure(409, "conflict", "This knowledge content already exists.");
      throw result.error;
    }
    if (!result.data) return failure(404, "not_found", "Knowledge source not found.");
    return { status: 202, body: parseSource(result.data) };
  } catch {
    return failure(500, "internal_error", "Knowledge source could not be replaced.");
  }
}

export async function archiveKnowledgeSource(input: {
  scope: ExperienceScope;
  sourceId: string;
  repository: KnowledgeSourceRepository;
}): Promise<KnowledgeSourceResult<KnowledgeSourceResponse>> {
  try {
    const result = await input.repository.archive(input.scope, input.sourceId);
    if (result.error) throw result.error;
    if (!result.data) return failure(404, "not_found", "Knowledge source not found.");
    return { status: 200, body: parseSource(result.data) };
  } catch {
    return failure(500, "internal_error", "Knowledge source could not be archived.");
  }
}

export async function reindexKnowledgeSource(input: {
  scope: ExperienceScope;
  sourceId: string;
  repository: KnowledgeSourceRepository;
}): Promise<KnowledgeSourceResult<KnowledgeSourceResponse>> {
  try {
    const result = await input.repository.reindex(input.scope, input.sourceId);
    if (result.error) throw result.error;
    if (!result.data) return failure(404, "not_found", "Knowledge source not found.");
    return { status: 202, body: parseSource(result.data) };
  } catch {
    return failure(500, "internal_error", "Knowledge source could not be reindexed.");
  }
}

export async function testKnowledgeSearch(input: {
  scope: ExperienceScope;
  value: unknown;
  repository: KnowledgeSourceRepository;
}): Promise<KnowledgeSourceResult<KnowledgeSearchTestResponse>> {
  const parsed = knowledgeSearchTestInputSchema.safeParse(input.value);
  if (!parsed.success) return failure(400, "validation_failed", "Knowledge search query is invalid.");
  try {
    const result = await input.repository.testSearch(input.scope, parsed.data.query);
    if (result.error) throw result.error;
    return { status: 200, body: knowledgeSearchTestResponseSchema.parse(result.data) };
  } catch {
    return failure(503, "service_unavailable", "Knowledge retrieval is temporarily unavailable.");
  }
}

export function normalizeKnowledgeContent(value: string) {
  return value.replace(/\r\n?/gu, "\n").replace(/[ \t]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
}

function parseKnowledgeSourceInput(value: unknown, kind: "text" | "pdf"): KnowledgeTextSourceInput | undefined {
  if (kind === "text") {
    const parsed = knowledgeTextSourceInputSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  }
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const sourceLabel = typeof record.source_label === "string" ? record.source_label.trim() : "";
  const content = typeof record.content === "string" ? record.content.trim() : "";
  return title.length >= 1 && title.length <= 160
    && sourceLabel.length >= 1 && sourceLabel.length <= 160
    && content.length >= 1 && content.length <= 250000
    ? { title, source_label: sourceLabel, content }
    : undefined;
}

function parseSource(value: unknown) {
  return knowledgeSourceResponseSchema.parse(value);
}

function isConflict(error: unknown) {
  return error && typeof error === "object" && "code" in error
    && (error as { code?: unknown }).code === "23505";
}

function failure(status: number, code: string, message: string): KnowledgeSourceResult<never> {
  return { status, body: platformErrorBody(code, message, status) };
}
