"use client";

import { useState } from "react";
import type { ExperienceDraftInput, ServiceResponse } from "@reservation-platform/sdk";
import { ExperiencePreview as SharedExperiencePreview, createExperiencePreviewConfig } from "@reservation-platform/ui";

type PreviewSize = "mobile" | "tablet" | "desktop";

export function ExperiencePreview({
  draft,
  services,
}: {
  draft: ExperienceDraftInput;
  services: ServiceResponse[];
}) {
  const [size, setSize] = useState<PreviewSize>("desktop");
  return <section className="experience-preview-panel">
    <header className="preview-toolbar">
      <div><strong>Draft preview</strong><span>Not visible to customers until published</span></div>
      <div role="group" aria-label="Preview size">
        {(["mobile", "tablet", "desktop"] as const).map((candidate) => <button
          type="button"
          key={candidate}
          className={candidate === size ? "active" : ""}
          aria-pressed={candidate === size}
          onClick={() => setSize(candidate)}
        >{candidate}</button>)}
      </div>
    </header>
    <div className={`preview-frame ${size}`}>
      <SharedExperiencePreview {...createExperiencePreviewConfig(draft, services)} />
    </div>
  </section>;
}
