import { redirect } from "next/navigation";
import { loadOnboardingData } from "../../lib/onboarding-loader";

export default async function OnboardingPage() {
  const data = await loadOnboardingData();
  redirect(data.state.nextStep ? `/setup/${data.state.nextStep}` : "/");
}
