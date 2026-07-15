import type { ReactNode } from "react";
import { StudioNavigation } from "../../components/studio/studio-navigation";
import { StudioProgress } from "../../components/studio/studio-progress";
import { createConsolePlatformClient } from "../../lib/platform-client";
import {
  calculateWorkspaceStudioProgress,
} from "../../lib/studio-sections";

export default async function StudioLayout({ children }: { children: ReactNode }) {
  let hasDraft = false;
  let hasPublished = false;
  let validation = { valid: false, issues: [{ path: "publish.draft", message: "Workspace unavailable." }] };
  try {
    const client = createConsolePlatformClient();
    const [workspace, result] = await Promise.all([
      client.getExperienceWorkspace(),
      client.validateExperienceWorkspace(),
    ]);
    validation = result;
    hasDraft = Boolean(workspace.draft);
    hasPublished = Boolean(workspace.published);
  } catch {
    // The page-level SetupError retains the actionable configuration message.
  }
  const progress = calculateWorkspaceStudioProgress({
    hasDraft,
    hasPublished,
    validation,
  });

  return (
    <div className="studio-workspace">
      <aside className="studio-rail">
        <StudioProgress completed={progress.completed} total={progress.total} percent={progress.percent} />
        <StudioNavigation statuses={progress.sections} showPreset={process.env.RESERVATION_CONSOLE_PROFILE === "evaluation"} />
      </aside>
      <div className="studio-content">{children}</div>
    </div>
  );
}
