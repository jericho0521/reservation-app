import type { BookingJourneyStep } from "@reservation-platform/react";
import type { ReactNode } from "react";
import { cn } from "../class-names.js";

const labels: Record<BookingJourneyStep | "service", string> = {
  service: "Service",
  practitioner: "Practitioner",
  date: "Date",
  slot: "Time",
  options: "Options",
  details: "Details",
  review: "Review",
  success: "Confirmed",
};

export function BookingStepProgress({
  step,
  appointment = false,
}: {
  step: BookingJourneyStep | "service";
  appointment?: boolean;
}) {
  const steps: Array<BookingJourneyStep | "service"> = appointment
    ? ["service", "practitioner", "date", "slot", "details", "review"]
    : ["service", "date", "slot", "options", "details", "review"];
  const current = step === "success" ? steps.length : steps.indexOf(step);
  return <nav className="rp-journey-progress" aria-label="Booking progress" tabIndex={0}>
    <ol>
      {steps.map((candidate, index) => <li
        key={candidate}
        className={cn(index === current && "current", index < current && "complete")}
        aria-current={index === current ? "step" : undefined}
      ><span>{index < current ? "✓" : index + 1}</span>{labels[candidate]}</li>)}
    </ol>
  </nav>;
}

export function BookingStepPanel({
  step,
  title,
  description,
  children,
}: {
  step: BookingJourneyStep;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return <section className="rp-step-panel" aria-labelledby={`rp-step-${step}`}>
    <header><span>{labels[step]}</span><h3 id={`rp-step-${step}`}>{title}</h3><p>{description}</p></header>
    {children}
  </section>;
}

export function BookingStepActions({
  canContinue,
  canGoBack,
  continueLabel = "Continue",
  onBack,
  onContinue,
}: {
  canContinue: boolean;
  canGoBack: boolean;
  continueLabel?: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  return <div className="rp-step-actions">
    <button type="button" onClick={onBack} disabled={!canGoBack}>Back</button>
    <button type="button" onClick={onContinue} disabled={!canContinue}>{continueLabel}</button>
  </div>;
}
