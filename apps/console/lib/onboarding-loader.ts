import "server-only";

import { isPlatformError } from "@reservation-platform/sdk";
import { createConsolePlatformClient } from "./platform-client";
import { deriveOnboardingState } from "./onboarding-state";

export async function loadOnboardingData() {
  const unscopedClient = createConsolePlatformClient(process.env, fetch, { includeActiveVenue: false });
  const session = await unscopedClient.getSession();
  const business = await readInstallationBusiness(unscopedClient);

  if (!business) {
    return {
      session,
      business: undefined,
      locations: [],
      services: [],
      resources: [],
      operatingHours: undefined,
      channels: undefined,
      workspace: undefined,
      state: deriveOnboardingState({
        ownerCreated: session.role === "owner",
        businessConfigured: false,
        locations: 0,
        activeServices: 0,
        activePractitioners: 0,
        operatingIntervals: 0,
        webBookingReady: false,
        emailReady: false,
        published: false,
      }),
    };
  }

  const options = { venueId: business.profile.venue_id };
  const [{ locations }, { services }, { resources }, operatingHours, channels, workspace, validation, email] = await Promise.all([
    unscopedClient.listInstallationLocations(),
    unscopedClient.listExperienceServices(options),
    unscopedClient.listExperienceResources(undefined, options),
    unscopedClient.getExperienceOperatingHours(options),
    unscopedClient.getExperienceChannelSettings(options),
    unscopedClient.getExperienceWorkspace(options),
    unscopedClient.validateExperienceWorkspace(options),
    unscopedClient.getEmailIntegrationSettings(),
  ]);
  const activeServices = services.filter((service) => service.is_active !== false);
  const activePractitioners = resources.filter((resource) => resource.is_active !== false);

  return {
    session,
    business,
    locations,
    services,
    resources,
    operatingHours,
    channels,
    workspace,
    validation,
    email,
    state: deriveOnboardingState({
      ownerCreated: session.role === "owner",
      businessConfigured: true,
      locations: locations.length,
      activeServices: activeServices.length,
      activePractitioners: activePractitioners.length,
      operatingIntervals: operatingHours.intervals.length,
      webBookingReady: channels.channels.web_booking && channels.readiness.web_booking.ready,
      emailReady: email.enabled && email.configured,
      published: Boolean(workspace.published),
    }),
  };
}

async function readInstallationBusiness(
  client: ReturnType<typeof createConsolePlatformClient>,
) {
  try {
    return await client.getInstallationBusiness();
  } catch (error) {
    if (isPlatformError(error) && error.body.status === 404) return undefined;
    throw error;
  }
}
