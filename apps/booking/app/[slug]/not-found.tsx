import Link from "next/link";

export default function ExperienceNotFound() {
  return <main className="error-page">
    <span className="experience-eyebrow">Not found</span>
    <h1>This experience is not available.</h1>
    <p>Check the link with the business. Draft and archived experiences are never exposed publicly.</p>
    <Link className="hero-secondary" href="/">Return home</Link>
  </main>;
}
