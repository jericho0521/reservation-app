import { listAvailability } from "@reservation-platform/api";
import { createPlatformAvailabilityRepository } from "../availability-repository";

export async function GET(request: Request) {
  const result = await listAvailability({
    repository: createPlatformAvailabilityRepository,
    query: new URL(request.url),
  });

  if (result.cause) {
    console.error("Failed to check platform availability:", result.cause);
  }

  return Response.json(result.body, { status: result.status });
}
