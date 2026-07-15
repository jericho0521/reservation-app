import type { OnboardingState, OnboardingStep } from "../../lib/onboarding-state";

const labels: Readonly<Record<OnboardingStep, string>> = {
  business: "Business",
  location: "Location",
  services: "Services",
  staff: "Practitioners",
  hours: "Hours",
  channels: "Channels",
  review: "Review",
};

export function SetupProgress({
  current,
  state,
}: {
  current: OnboardingStep;
  state: OnboardingState;
}) {
  return (
    <nav aria-label="Business setup progress" className="setup-progress">
      <ol>
        {Object.entries(labels).map(([step, label]) => {
          const id = step as OnboardingStep;
          const complete = state.steps[id];
          return (
            <li className={complete ? "is-complete" : undefined} key={id}>
              <a aria-current={id === current ? "step" : undefined} href={`/admin/setup/${id}`}>
                <span>{complete ? "✓" : id === current ? "•" : "○"}</span>
                {label}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
