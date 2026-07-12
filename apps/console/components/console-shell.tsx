import type { ReactNode } from "react";

const futureSections: string[] = [];

export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <div className="console-frame">
      <a className="skip-link" href="#console-main">Skip to main content</a>
      <aside className="console-sidebar">
        <a className="console-brand" href="/">
          <span className="brand-mark">R</span>
          <span>
            <strong>Reservation</strong>
            <small>Experience Platform</small>
          </span>
        </a>
        <nav aria-label="Owner console">
          <a href="/">Overview</a>
          <a href="/studio">Experience Studio</a>
          <a href="/conversations">Conversations</a>
          <a href="/reservations">Reservations</a>
          <a href="/resources">Resources & maintenance</a>
          <a href="/channels">Channels & AI</a>
          <a href="/analytics">Analytics</a>
          {futureSections.map((section) => (
            <span aria-disabled="true" className="nav-disabled" key={section}>
              {section}
              <small>Coming soon</small>
            </span>
          ))}
        </nav>
        <p className="sidebar-note">One engine. Every booking channel.</p>
      </aside>
      <main className="console-main" id="console-main" tabIndex={-1}>{children}</main>
    </div>
  );
}
