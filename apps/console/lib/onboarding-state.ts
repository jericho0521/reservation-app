export const onboardingSteps = [
  "business",
  "location",
  "services",
  "staff",
  "hours",
  "channels",
  "review",
] as const;

export type OnboardingStep = (typeof onboardingSteps)[number];

export interface OnboardingStateInput {
  ownerCreated: boolean;
  businessConfigured: boolean;
  locations: number;
  activeServices: number;
  activePractitioners: number;
  operatingIntervals: number;
  webBookingReady: boolean;
  emailReady: boolean;
  published: boolean;
}

export interface OnboardingState {
  nextStep?: OnboardingStep;
  canPublish: boolean;
  complete: boolean;
  emailDelivery: "ready" | "phase_3_pending";
  steps: Readonly<Record<OnboardingStep, boolean>>;
}

export function deriveOnboardingState(input: OnboardingStateInput): OnboardingState {
  const readyToPublish = input.ownerCreated
    && input.businessConfigured
    && input.locations > 0
    && input.activeServices > 0
    && input.activePractitioners > 0
    && input.operatingIntervals > 0
    && input.webBookingReady;
  const steps: Record<OnboardingStep, boolean> = {
    business: input.ownerCreated && input.businessConfigured,
    location: input.locations > 0,
    services: input.activeServices > 0,
    staff: input.activePractitioners > 0,
    hours: input.operatingIntervals > 0,
    channels: input.webBookingReady,
    review: input.published,
  };

  return {
    ...(input.published
      ? {}
      : { nextStep: onboardingSteps.find((step) => !steps[step]) ?? "review" }),
    canPublish: readyToPublish && !input.published,
    complete: input.published,
    emailDelivery: input.emailReady ? "ready" : "phase_3_pending",
    steps: Object.freeze(steps),
  };
}

export function requiredPriorStep(
  state: OnboardingState,
  requested: OnboardingStep,
): OnboardingStep | undefined {
  if (!state.nextStep) return undefined;
  return onboardingSteps.indexOf(state.nextStep) < onboardingSteps.indexOf(requested)
    ? state.nextStep
    : undefined;
}
