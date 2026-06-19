import { NextResponse } from "next/server";
import { listPlatformServices } from "@reservation-platform/api";
import { createPlatformCatalogRepository } from "../catalog-repository";

export async function GET() {
  try {
    const result = await listPlatformServices(createPlatformCatalogRepository());
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("Failed to fetch platform services:", error);
    return NextResponse.json({
      error: {
        code: "bad_request",
        message: "Failed to fetch services.",
        status: 500,
      },
    }, { status: 500 });
  }
}
