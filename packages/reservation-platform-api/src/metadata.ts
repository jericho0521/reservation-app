import type { MetadataResponse } from "@reservation-platform/contract-types";

export function getPlatformMetadata(): MetadataResponse {
  return {
    api_version: "v1",
    modules: ["reservations"],
    compatibility: {
      notices: [
        "Initial Next.js compatibility implementation for the backend platform /v1 contract.",
        "Resource maintenance list/create/end are available in compatibility mode; bulk replace is implemented by the frontend wrapper until the backend platform exposes a first-class bulk endpoint.",
      ],
    },
  };
}
