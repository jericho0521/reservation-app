import type { ReactNode } from "react";

const futureSections = [
  "Reservations",
  "Resources & maintenance",
  "Analytics",
];

export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <div className="console-frame">
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
          <a href="/channels">Channels & AI</a>
          {futureSections.map((section) => (
            <span aria-disabled="true" className="nav-disabled" key={section}>
              {section}
              <small>Coming soon</small>
            </span>
          ))}
        </nav>
        <p className="sidebar-note">One engine. Every booking channel.</p>
      </aside>
      <main className="console-main">{children}</main>
    </div>
  );
}
