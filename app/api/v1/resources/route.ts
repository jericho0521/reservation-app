import { NextResponse } from "next/server";
import { listPlatformResources } from "@reservation-platform/api";
import { createPlatformCatalogRepository } from "../catalog-repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get("service_id");

  try {
    const result = await listPlatformResources(createPlatformCatalogRepository(), { serviceId });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("Failed to fetch platform resources:", error);
    return NextResponse.json({
      error: {
        code: "bad_request",
        message: "Failed to fetch resources.",
        status: 500,
      },
    }, { status: 500 });
  }
}
