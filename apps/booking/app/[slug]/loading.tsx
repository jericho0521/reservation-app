export default function Loading() {
  return <main className="skeleton-page" aria-busy="true" aria-label="Loading experience">
    <div className="skeleton skeleton-kicker" />
    <div className="skeleton skeleton-title" />
    <div className="skeleton skeleton-copy" />
  </main>;
}
