import { platformCatalogResponse } from "../catalog-route";

export async function GET() {
  return platformCatalogResponse({
    path: "/v1/venues",
    logLabel: "venues",
    failureMessage: "Failed to fetch venues.",
  });
}
