import {
  isPlatformError,
  type PublicExperienceResponse,
  type ReservationPlatformClient,
} from "@reservation-platform/sdk";

export type PublicExperienceLoadResult =
  | { found: true; experience: PublicExperienceResponse }
  | { found: false };

export async function loadPublicExperience(
  client: Pick<ReservationPlatformClient, "getPublicExperience">,
  slug: string,
): Promise<PublicExperienceLoadResult> {
  try {
    return { found: true, experience: await client.getPublicExperience(slug) };
  } catch (error) {
    if (isPlatformError(error) && error.body.status === 404) {
      return { found: false };
    }
    throw error;
  }
}
