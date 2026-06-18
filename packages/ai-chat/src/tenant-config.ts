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

