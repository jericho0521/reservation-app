import { platformCatalogResponse } from "../../catalog-route";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return platformCatalogResponse({
    path: params.then(({ id }) => `/v1/resources/${encodeURIComponent(id)}`),
    logLabel: "resource",
    failureMessage: "Failed to fetch resource.",
  });
}
