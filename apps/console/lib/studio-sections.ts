import type { ExperienceValidationResponse } from "@reservation-platform/sdk";

export type StudioSectionId =
  | "preset"
  | "profile"
  | "services"
  | "resources"
  | "availability"
  | "knowledge"
  | "branding"
  | "publish";

export interface StudioSection {
  id: StudioSectionId;
  label: string;
  shortLabel: string;
  description: string;
}

export const studioSections: readonly StudioSection[] = Object.freeze([
  { id: "preset", label: "Industry preset", shortLabel: "Preset", description: "Choose the booking model and terminology that fit the business." },
  { id: "profile", label: "Business profile", shortLabel: "Profile", description: "Set the public identity and venue context." },
  { id: "services", label: "Services", shortLabel: "Services", description: "Define what customers can reserve." },
  { id: "resources", label: "Resources", shortLabel: "Resources", description: "Assign rooms, staff, stations, courts, or shared capacity." },
  { id: "availability", label: "Hours & availability", shortLabel: "Hours", description: "Control operating hours and booking rules." },
  { id: "knowledge", label: "AI knowledge", shortLabel: "Knowledge", description: "Teach the booking assistant business-specific answers." },
  { id: "branding", label: "Branding & terminology", shortLabel: "Branding", description: "Tune colors, voice, and customer-facing words." },
  { id: "publish", label: "Preview & publish", shortLabel: "Publish", description: "Resolve validation issues and make the experience live." },
]);

export type StudioSectionStatus = "complete" | "incomplete" | "invalid";

export function getStudioSectionHref(id: StudioSectionId) {
  return `/studio/${id}`;
}

export function getStudioSection(id: string): StudioSection | undefined {
  return studioSections.find((section) => section.id === id);
}

export function calculateStudioProgress(input: {
  savedSections: readonly StudioSectionId[];
  validation: ExperienceValidationResponse;
}) {
  const saved = new Set(input.savedSections);
  const invalid = new Set(
    input.validation.issues.map((issue) => sectionForValidationPath(issue.path)),
  );
  const sections = Object.fromEntries(studioSections.map((section) => [
    section.id,
    invalid.has(section.id)
      ? "invalid"
      : saved.has(section.id)
        ? "complete"
        : "incomplete",
  ])) as Record<StudioSectionId, StudioSectionStatus>;
  const completed = Object.values(sections).filter((status) => status === "complete").length;

  return {
    completed,
    total: studioSections.length,
    percent: Math.round((completed / studioSections.length) * 100),
    sections,
  };
}

export function sectionForValidationPath(path: string): StudioSectionId {
  if (path.startsWith("preset")) return "preset";
  if (path.startsWith("profile")) return "profile";
  if (path.startsWith("services")) return "services";
  if (path.startsWith("resources")) return "resources";
  if (path.startsWith("availability")) return "availability";
  if (path.startsWith("knowledge")) return "knowledge";
  if (path.startsWith("channels")) return "knowledge";
  if (path.startsWith("branding") || path.startsWith("terminology")) return "branding";
  return "publish";
}
