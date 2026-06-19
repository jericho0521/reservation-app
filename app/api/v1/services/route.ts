import { platformCatalogResponse } from "../catalog-route";

export async function GET() {
  return platformCatalogResponse({
    path: "/v1/services",
    logLabel: "services",
    failureMessage: "Failed to fetch services.",
  });
}
