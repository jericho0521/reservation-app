import { platformCatalogResponse } from "../../catalog-route";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return platformCatalogResponse({
    path: params.then(({ id }) => `/v1/resource-layouts/${encodeURIComponent(id)}`),
    logLabel: "resource layout",
    failureMessage: "Failed to fetch resource layout.",
  });
}
