import { NextResponse } from "next/server";
import { getPlatformVenue } from "@reservation-platform/api";
import { createPlatformCatalogRepository } from "../../catalog-repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await getPlatformVenue(createPlatformCatalogRepository(), id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("Failed to fetch platform venue:", error);
    return NextResponse.json({
      error: {
        code: "bad_request",
        message: "Failed to fetch venue.",
        status: 500,
      },
    }, { status: 500 });
  }
}
