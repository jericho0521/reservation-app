"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  getStudioSectionHref,
  studioSections,
  type StudioSectionStatus,
} from "../../lib/studio-sections";

export function StudioNavigation({
  statuses,
}: {
  statuses: Record<string, StudioSectionStatus>;
}) {
  const pathname = usePathname();

  return (
    <nav className="studio-navigation" aria-label="Experience setup steps">
      {studioSections.map((section, index) => {
        const href = getStudioSectionHref(section.id);
        const active = pathname === href || (section.id === "preset" && pathname === "/studio");
        const status = statuses[section.id] ?? "incomplete";
        return (
          <Link aria-current={active ? "step" : undefined} className={active ? "active" : ""} href={href} key={section.id}>
            <span className={`step-index ${status}`}>{status === "complete" ? "✓" : index + 1}</span>
            <span><strong>{section.shortLabel}</strong><small>{status}</small></span>
          </Link>
        );
      })}
    </nav>
  );
}
