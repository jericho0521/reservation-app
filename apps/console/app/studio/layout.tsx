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
  let validation = { valid: false, issues: [{ path: "publish.draft", message: "Workspace unavailable." }] };
  try {
    const client = createConsolePlatformClient();
    const [workspace, result] = await Promise.all([
      client.getExperienceWorkspace(),
      client.validateExperienceWorkspace(),
    ]);
    validation = result;
    savedSections.push("preset", "profile");
    if (workspace.draft) savedSections.push("branding");
    for (const section of ["services", "resources", "availability", "knowledge"] as const) {
      if (!validation.issues.some((issue) => (
        issue.path.startsWith(section) || (section === "knowledge" && issue.path.startsWith("channels"))
      ))) savedSections.push(section);
    }
    if (validation.valid || workspace.published) savedSections.push("publish");
  } catch {
    // The page-level SetupError retains the actionable configuration message.
  }
  const progress = calculateStudioProgress({
    savedSections,
    validation,
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
