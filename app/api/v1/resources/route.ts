import { platformCatalogResponse } from "../catalog-route";

export async function GET(request: Request) {
  return platformCatalogResponse({
    path: "/v1/resources",
    request,
    logLabel: "resources",
    failureMessage: "Failed to fetch resources.",
  });
}
