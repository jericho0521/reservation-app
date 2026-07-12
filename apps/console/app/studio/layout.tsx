import type { ReactNode } from "react";
import { StudioNavigation } from "../../components/studio/studio-navigation";
import { StudioProgress } from "../../components/studio/studio-progress";
import { createConsolePlatformClient } from "../../lib/platform-client";
import {
  calculateStudioProgress,
  type StudioSectionId,
} from "../../lib/studio-sections";

export default async function StudioLayout({ children }: { children: ReactNode }) {
  const savedSections: StudioSectionId[] = [];
  try {
    const workspace = await createConsolePlatformClient().getExperienceWorkspace();
    savedSections.push("preset", "profile");
    if (workspace.draft) savedSections.push("branding");
    if (workspace.published) savedSections.push("publish");
  } catch {
    // The page-level SetupError retains the actionable configuration message.
  }
  const progress = calculateStudioProgress({
    savedSections,
    validation: { valid: true, issues: [] },
  });

  return (
    <div className="studio-workspace">
      <aside className="studio-rail">
        <StudioProgress completed={progress.completed} total={progress.total} percent={progress.percent} />
        <StudioNavigation statuses={progress.sections} />
      </aside>
      <div className="studio-content">{children}</div>
    </div>
  );
}
