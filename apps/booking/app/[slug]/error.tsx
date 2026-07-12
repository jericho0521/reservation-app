"use client";

export default function ExperienceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="error-page">
    <span className="experience-eyebrow">Temporary interruption</span>
    <h1>We could not load this experience.</h1>
    <p>Please try again. No reservation has been changed.</p>
    <button className="hero-action" type="button" onClick={reset}>Try again</button>
  </main>;
}
