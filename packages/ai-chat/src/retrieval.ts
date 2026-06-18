import type { MetadataRecord } from "@reservation-platform/contract-types";
import type { ChatTenantScope } from "./tenant-config.js";

export interface RetrievalQuery {
  scope: ChatTenantScope;
  query: string;
  limit?: number;
  filters?: MetadataRecord;
  metadata?: MetadataRecord;
}

export interface RetrievalResult {
  id: string;
  content: string;
  score?: number;
  source?: string;
  metadata?: MetadataRecord;
}

export interface ChatRetriever {
  search(query: RetrievalQuery): Promise<RetrievalResult[]>;
}

