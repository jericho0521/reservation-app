import { NextResponse } from "next/server";
import { getPlatformMetadata } from "@reservation-platform/api";

export async function GET() {
  return NextResponse.json(getPlatformMetadata());
}
