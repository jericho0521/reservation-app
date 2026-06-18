import type { JsonValue, MetadataRecord, PlatformErrorBody } from "@reservation-platform/contract-types";
import type { ChatTenantScope } from "./tenant-config.js";

export type ChatAuditEventType =
  | "chat.workflow.started"
  | "chat.workflow.completed"
  | "chat.workflow.failed"
  | "chat.retrieval.completed"
  | "chat.checkpoint.loaded"
  | "chat.checkpoint.saved";

export interface ChatAuditEvent {
  type: ChatAuditEventType;
  scope: ChatTenantScope;
  session_id?: string;
  correlation_id?: string;
  error?: PlatformErrorBody;
  metadata?: MetadataRecord;
  data?: JsonValue;
  occurred_at?: string;
}

export interface ChatAuditSink {
  record(event: ChatAuditEvent): Promise<void> | void;
}

