import type { ReactNode } from "react";

const futureSections: string[] = [];

export function ConsoleShell({ children, role }: { children: ReactNode; role?: "owner" | "staff" }) {
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
        <p className="sidebar-note">{role ? `${role} session` : "Authenticated session"} · One engine. Every booking channel.</p>
      </aside>
      <main className="console-main" id="console-main" tabIndex={-1}>{children}</main>
    </div>
  );
}
