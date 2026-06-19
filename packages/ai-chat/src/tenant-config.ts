import type { MetadataRecord } from "@reservation-platform/contract-types";

export interface ChatTenantScope {
  tenant_id: string;
  venue_id?: string;
}

export interface ChatTenantConfig {
  scope: ChatTenantScope;
  locale?: string;
  timezone?: string;
  module_enabled?: boolean;
  model_profile_id?: string;
  retrieval_profile_id?: string;
  metadata?: MetadataRecord;
}

export interface ChatTenantScopeValidationResult {
  valid: boolean;
  scope?: ChatTenantScope;
}

export function validateChatTenantScope(
  scope: Partial<ChatTenantScope> | undefined,
): ChatTenantScopeValidationResult {
  const tenantId = typeof scope?.tenant_id === "string" ? scope.tenant_id.trim() : "";
  const venueId = typeof scope?.venue_id === "string" ? scope.venue_id.trim() : scope?.venue_id;

  if (!tenantId || (scope?.venue_id !== undefined && (!venueId || typeof venueId !== "string"))) {
    return { valid: false };
  }

  return {
    valid: true,
    scope: venueId ? { tenant_id: tenantId, venue_id: venueId } : { tenant_id: tenantId },
  };
}

export function normalizeChatTenantConfig(
  tenantConfig: ChatTenantConfig,
): ChatTenantConfig | undefined {
  const result = validateChatTenantScope(tenantConfig.scope);
  if (!result.valid || !result.scope) {
    return undefined;
  }

  return {
    ...tenantConfig,
    scope: result.scope,
  };
}
