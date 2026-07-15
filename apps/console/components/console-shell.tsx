import type { ReactNode } from "react";

const futureSections: string[] = [];

export function ConsoleShell({
  activeLocation,
  children,
  role,
}: {
  activeLocation?: { venueId: string; canChange: boolean };
  children: ReactNode;
  role?: "owner" | "staff";
}) {
  return (
    <div className="console-frame">
      <a className="skip-link" href="#console-main">Skip to main content</a>
      <aside className="console-sidebar">
        <a className="console-brand" href="/admin">
          <span className="brand-mark">R</span>
          <span>
            <strong>Reservation</strong>
            <small>Experience Platform</small>
          </span>
        </a>
        <nav aria-label="Owner console">
          <a href="/admin">Overview</a>
          <a href="/admin/studio">Experience Studio</a>
          <a href="/admin/conversations">Conversations</a>
          <a href="/admin/reservations">Reservations</a>
          <a href="/admin/resources">Resources & maintenance</a>
          <a href="/admin/channels">Channels & AI</a>
          <a href="/admin/analytics">Analytics</a>
          {futureSections.map((section) => (
            <span aria-disabled="true" className="nav-disabled" key={section}>
              {section}
              <small>Coming soon</small>
            </span>
          ))}
        </nav>
        <div className="sidebar-context">
          {activeLocation ? <p>Location <code>{activeLocation.venueId}</code>{activeLocation.canChange ? <> · <a href="/admin/location">Change</a></> : null}</p> : null}
          <p>{role ? `${role} session` : "Authenticated session"} · One engine. Every booking channel.</p>
        </div>
      </aside>
      <main className="console-main" id="console-main" tabIndex={-1}>{children}</main>
    </div>
  );
}
