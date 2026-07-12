import {
  experienceChannelsSchema,
  experienceKnowledgeEntryResponseSchema,
  experienceKnowledgeInputSchema,
  type ExperienceChannelReadiness,
  type ExperienceChannelSettingsResponse,
  type ExperienceChannels,
  type ExperienceKnowledgeEntryResponse,
  type ExperienceKnowledgeInput,
  type ListExperienceKnowledgeResponse,
} from "@reservation-platform/contract-types";
import { platformErrorBody } from "./errors.js";
import type { ExperienceScope, ExperienceStudioRepository } from "./experience-studio.js";

type KnowledgeStorageResult = { data: unknown | null; error?: unknown };

export interface ExperienceKnowledgeRepository {
  list(scope: ExperienceScope, options?: { includeArchived?: boolean }): Promise<{ data: unknown[]; error?: unknown }>;
  create(scope: ExperienceScope, input: ExperienceKnowledgeInput): Promise<KnowledgeStorageResult>;
  update(scope: ExperienceScope, id: string, input: ExperienceKnowledgeInput): Promise<KnowledgeStorageResult>;
  archive(scope: ExperienceScope, id: string): Promise<KnowledgeStorageResult>;
}

export interface ExperienceChannelRuntimeReadiness {
  web_booking: { configured: boolean; ready: boolean; message?: string };
  web_chat: { configured: boolean; ready: boolean; message?: string };
  whatsapp: { configured: boolean; ready: boolean; message?: string };
}

type ExperienceKnowledgeResult<T> = {
  status: number;
  body: T | ReturnType<typeof platformErrorBody>;
  cause?: unknown;
};

export async function listExperienceKnowledge(input: {
  scope: ExperienceScope;
  repository: ExperienceKnowledgeRepository;
  includeArchived?: boolean;
}): Promise<ExperienceKnowledgeResult<ListExperienceKnowledgeResponse>> {
  const scope = normalizeScope(input.scope);
  if (!scope) return failure("validation_failed", "Tenant and venue identifiers are required.", 400);
  try {
    const result = await input.repository.list(scope, { includeArchived: input.includeArchived });
    if (result.error) return storageFailure("Failed to list experience knowledge.", result.error);
    const entries = result.data.map(parseKnowledgeEntry).sort((left, right) => (
      left.question.localeCompare(right.question) || left.knowledge_id.localeCompare(right.knowledge_id)
    ));
    return { status: 200, body: { entries } };
  } catch (error) {
    return storageFailure("Failed to list experience knowledge.", error);
  }
}

export async function createExperienceKnowledge(input: {
  scope: ExperienceScope;
  value: unknown;
  repository: ExperienceKnowledgeRepository;
}): Promise<ExperienceKnowledgeResult<ExperienceKnowledgeEntryResponse>> {
  return mutateKnowledge({ ...input, operation: "create" });
}

export async function updateExperienceKnowledge(input: {
  scope: ExperienceScope;
  knowledgeId: string;
  value: unknown;
  repository: ExperienceKnowledgeRepository;
}): Promise<ExperienceKnowledgeResult<ExperienceKnowledgeEntryResponse>> {
  return mutateKnowledge({ ...input, operation: "update" });
}

export async function archiveExperienceKnowledge(input: {
  scope: ExperienceScope;
  knowledgeId: string;
  repository: ExperienceKnowledgeRepository;
}): Promise<ExperienceKnowledgeResult<ExperienceKnowledgeEntryResponse>> {
  const scope = normalizeScope(input.scope);
  const id = input.knowledgeId.trim();
  if (!scope || !id) return failure("validation_failed", "Tenant, venue, and knowledge identifiers are required.", 400);
  try {
    const result = await input.repository.archive(scope, id);
    return knowledgeMutationResult(result, 200, "Failed to archive experience knowledge.");
  } catch (error) {
    return storageFailure("Failed to archive experience knowledge.", error);
  }
}

export async function readExperienceChannelSettings(input: {
  scope: ExperienceScope;
  repository: ExperienceStudioRepository;
  readiness: ExperienceChannelRuntimeReadiness;
}): Promise<ExperienceKnowledgeResult<ExperienceChannelSettingsResponse>> {
  const scope = normalizeScope(input.scope);
  if (!scope) return failure("validation_failed", "Tenant and venue identifiers are required.", 400);
  try {
    const workspace = await input.repository.readWorkspace(scope);
    if (!workspace) return failure("not_found", "Experience workspace not found.", 404);
    const channels = workspace.draft?.channels ?? workspace.published?.channels ?? {
      web_booking: true,
      web_chat: false,
      whatsapp: false,
    };
    return { status: 200, body: channelSettings(channels, input.readiness) };
  } catch (error) {
    return storageFailure("Failed to read experience channels.", error);
  }
}

export async function updateExperienceChannelSettings(input: {
  scope: ExperienceScope;
  value: unknown;
  repository: ExperienceStudioRepository;
  readiness: ExperienceChannelRuntimeReadiness;
}): Promise<ExperienceKnowledgeResult<ExperienceChannelSettingsResponse>> {
  const scope = normalizeScope(input.scope);
  const parsed = experienceChannelsSchema.safeParse(input.value);
  if (!scope || !parsed.success) return failure("validation_failed", "Experience channels are invalid.", 400);
  if (!parsed.data.web_booking && !parsed.data.web_chat && !parsed.data.whatsapp) {
    return failure("validation_failed", "At least one customer channel must be enabled.", 400);
  }
  if (!input.repository.updateChannels) return failure("bad_request", "Channel repository is not configured.", 503);
  try {
    const workspace = await input.repository.updateChannels(scope, parsed.data);
    return workspace
      ? { status: 200, body: channelSettings(workspace.draft?.channels ?? parsed.data, input.readiness) }
      : failure("not_found", "Experience workspace not found.", 404);
  } catch (error) {
    return storageFailure("Failed to update experience channels.", error);
  }
}

async function mutateKnowledge(input: {
  scope: ExperienceScope;
  knowledgeId?: string;
  value: unknown;
  repository: ExperienceKnowledgeRepository;
  operation: "create" | "update";
}): Promise<ExperienceKnowledgeResult<ExperienceKnowledgeEntryResponse>> {
  const scope = normalizeScope(input.scope);
  const id = input.knowledgeId?.trim();
  const parsed = experienceKnowledgeInputSchema.safeParse(input.value);
  if (!scope || !parsed.success || (input.operation === "update" && !id)) {
    return failure("validation_failed", "Experience knowledge input is invalid.", 400);
  }
  try {
    const result = input.operation === "create"
      ? await input.repository.create(scope, parsed.data)
      : await input.repository.update(scope, id!, parsed.data);
    return knowledgeMutationResult(result, input.operation === "create" ? 201 : 200, `Failed to ${input.operation} experience knowledge.`);
  } catch (error) {
    return storageFailure(`Failed to ${input.operation} experience knowledge.`, error);
  }
}

function knowledgeMutationResult(
  result: KnowledgeStorageResult,
  status: number,
  message: string,
): ExperienceKnowledgeResult<ExperienceKnowledgeEntryResponse> {
  if (result.error) return storageFailure(message, result.error);
  if (!result.data) return failure("not_found", "Experience knowledge entry not found.", 404);
  try {
    return { status, body: parseKnowledgeEntry(result.data) };
  } catch (error) {
    return storageFailure("Stored experience knowledge is invalid.", error);
  }
}

function parseKnowledgeEntry(value: unknown) {
  return experienceKnowledgeEntryResponseSchema.parse(value);
}

function channelSettings(
  channels: ExperienceChannels,
  readiness: ExperienceChannelRuntimeReadiness,
): ExperienceChannelSettingsResponse {
  return {
    channels,
    readiness: {
      web_booking: channelReadiness(channels.web_booking, readiness.web_booking),
      web_chat: channelReadiness(channels.web_chat, readiness.web_chat),
      whatsapp: channelReadiness(channels.whatsapp, readiness.whatsapp),
    },
  };
}

function channelReadiness(
  desiredEnabled: boolean,
  runtime: { configured: boolean; ready: boolean; message?: string },
): ExperienceChannelReadiness {
  return {
    desired_enabled: desiredEnabled,
    configured: runtime.configured,
    ready: runtime.ready,
    state: runtime.ready ? "ready" : runtime.configured ? "degraded" : "not_configured",
    ...(runtime.message ? { message: runtime.message } : {}),
  };
}

function normalizeScope(scope: ExperienceScope) {
  const tenantId = scope.tenantId.trim();
  const venueId = scope.venueId.trim();
  return tenantId && venueId ? { tenantId, venueId } : null;
}

function failure(code: string, message: string, status: number): ExperienceKnowledgeResult<never> {
  return { status, body: platformErrorBody(code, message, status) };
}

function storageFailure(message: string, cause: unknown): ExperienceKnowledgeResult<never> {
  return { status: 500, body: platformErrorBody("internal_error", message, 500), cause };
}
