import { platformCatalogResponse } from "../../catalog-route";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return platformCatalogResponse({
    path: params.then(({ id }) => `/v1/venues/${encodeURIComponent(id)}`),
    logLabel: "venue",
    failureMessage: "Failed to fetch venue.",
  });
}
