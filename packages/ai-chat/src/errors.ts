import type { JsonValue, PlatformErrorBody, PlatformErrorCode } from "@reservation-platform/contract-types";

export class ChatWorkflowError extends Error {
  readonly code: PlatformErrorCode;
  readonly status: number;
  readonly request_id?: string;
  readonly retryable?: boolean;
  readonly documentation_url?: string;
  readonly idempotency?: PlatformErrorBody["idempotency"];
  readonly details?: JsonValue;

  constructor(error: PlatformErrorBody) {
    super(error.message);
    this.name = "ChatWorkflowError";
    this.code = error.code;
    this.status = error.status;
    this.request_id = error.request_id;
    this.retryable = error.retryable;
    this.documentation_url = error.documentation_url;
    this.idempotency = error.idempotency;
    this.details = error.details;
  }

  toPlatformError(): PlatformErrorBody {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      request_id: this.request_id,
      retryable: this.retryable,
      documentation_url: this.documentation_url,
      idempotency: this.idempotency,
      details: this.details,
    };
  }
}

export function moduleDisabledError(): PlatformErrorBody {
  return {
    code: "chat_module_disabled",
    message: "Chat module is disabled.",
    status: 404,
  };
}

export function modelProviderUnavailableError(): PlatformErrorBody {
  return {
    code: "model_provider_unavailable",
    message: "Chat model provider is unavailable.",
    status: 503,
    retryable: true,
  };
}

export function publicChatError(error: unknown): PlatformErrorBody {
  if (error instanceof ChatWorkflowError) {
    return sanitizeInternalPlatformError(error.toPlatformError());
  }

  if (isPlatformErrorBody(error)) {
    return sanitizeExternalPlatformError(error);
  }

  return sanitizeInternalPlatformError(modelProviderUnavailableError());
}

export function sanitizeInternalPlatformError(error: PlatformErrorBody): PlatformErrorBody {
  const sanitized: PlatformErrorBody = {
    code: error.code,
    message: error.message,
    status: error.status,
  };

  if (error.request_id) {
    sanitized.request_id = error.request_id;
  }
  if (error.retryable !== undefined) {
    sanitized.retryable = error.retryable;
  }
  if (error.documentation_url) {
    sanitized.documentation_url = error.documentation_url;
  }
  if (error.idempotency) {
    sanitized.idempotency = error.idempotency;
  }

  return sanitized;
}

export function sanitizeExternalPlatformError(error: PlatformErrorBody): PlatformErrorBody {
  return {
    code: error.code,
    message: error.message,
    status: error.status,
  };
}

function isPlatformErrorBody(value: unknown): value is PlatformErrorBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PlatformErrorBody>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.status === "number"
  );
}
