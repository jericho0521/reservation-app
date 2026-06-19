import { NextResponse } from "next/server";
import { handlePlatformCatalogRequest } from "@reservation-platform/api";
import { createPlatformCatalogRepository } from "./catalog-repository";

export async function platformCatalogResponse(input: {
  path: string | Promise<string>;
  request?: Request;
  logLabel: string;
  failureMessage: string;
}) {
  try {
    const path = await input.path;
    const result = await handlePlatformCatalogRequest({
      path,
      repository: createPlatformCatalogRepository(),
      url: input.request?.url,
    });

    if (!result) {
      return NextResponse.json({
        error: {
          code: "not_found",
          message: "Route not found.",
          status: 404,
        },
      }, { status: 404 });
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error(`Failed to fetch platform ${input.logLabel}:`, error);
    return NextResponse.json({
      error: {
        code: "bad_request",
        message: input.failureMessage,
        status: 500,
      },
    }, { status: 500 });
  }
}
