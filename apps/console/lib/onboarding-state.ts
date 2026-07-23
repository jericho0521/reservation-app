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
  presetId?: "seat_capacity" | "appointments_salon" | string;
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
  sequence: readonly OnboardingStep[];
}

export function deriveOnboardingState(input: OnboardingStateInput): OnboardingState {
  const appointmentMode = input.presetId === "appointments_salon";
  const sequence: readonly OnboardingStep[] = appointmentMode
    ? onboardingSteps
    : ["business", "services", "hours", "review"];
  const readyToPublish = input.ownerCreated
    && input.businessConfigured
    && input.locations > 0
    && input.activeServices > 0
    && (!appointmentMode || input.activePractitioners > 0)
    && input.operatingIntervals > 0
    && input.webBookingReady;
  const steps: Record<OnboardingStep, boolean> = {
    business: input.ownerCreated && input.businessConfigured,
    location: input.locations > 0,
    services: input.activeServices > 0,
    staff: !appointmentMode || input.activePractitioners > 0,
    hours: input.operatingIntervals > 0,
    channels: input.webBookingReady,
    review: input.published,
  };

  return {
    ...(input.published
      ? {}
      : { nextStep: sequence.find((step) => !steps[step]) ?? "review" }),
    canPublish: readyToPublish && !input.published,
    complete: input.published,
    emailDelivery: input.emailReady ? "ready" : "phase_3_pending",
    steps: Object.freeze(steps),
    sequence: Object.freeze([...sequence]),
  };
}

export function requiredPriorStep(
  state: OnboardingState,
  requested: OnboardingStep,
): OnboardingStep | undefined {
  if (!state.nextStep) return undefined;
  if (!state.sequence.includes(requested)) return state.nextStep;
  return state.sequence.indexOf(state.nextStep) < state.sequence.indexOf(requested)
    ? state.nextStep
    : undefined;
}
