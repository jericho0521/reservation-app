import type { PublicExperienceResponse } from "@reservation-platform/sdk";
import type { CSSProperties, ReactNode } from "react";

export function createExperienceThemeStyle(
  branding: PublicExperienceResponse["configuration"]["branding"],
): CSSProperties {
  return {
    "--experience-primary": branding.primary_color ?? "#6d5dfc",
    "--experience-secondary": branding.secondary_color ?? "#111827",
  } as CSSProperties;
}

export function ExperienceTheme({
  branding,
  children,
}: {
  branding: PublicExperienceResponse["configuration"]["branding"];
  children: ReactNode;
}) {
  return <div className="experience-theme" style={createExperienceThemeStyle(branding)}>{children}</div>;
}
