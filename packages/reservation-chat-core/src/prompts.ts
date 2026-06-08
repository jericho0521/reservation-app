export interface BookingPromptCopy {
  assistantName?: string;
  venueName?: string;
  supportCopy?: string;
  confirmationCopy?: string;
}

export interface ReservationRule {
  label: string;
  description: string;
}

export interface BookingPromptSectionOptions {
  copy?: BookingPromptCopy;
  reservationRules?: readonly ReservationRule[];
  toolInstructions?: readonly string[];
}

function buildLines(title: string, lines: readonly string[]): string {
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

  if (nonEmptyLines.length === 0) {
    return "";
  }

  return [`## ${title}`, ...nonEmptyLines].join("\n");
}

export function buildBookingIdentityPromptSection(copy: BookingPromptCopy = {}): string {
  return buildLines("Assistant", [
    copy.assistantName ? `Name: ${copy.assistantName}` : "",
    copy.venueName ? `Venue: ${copy.venueName}` : "",
    copy.supportCopy ?? "",
  ]);
}

export function buildReservationRulesPromptSection(
  rules: readonly ReservationRule[] = []
): string {
  return buildLines(
    "Reservation rules",
    rules.map((rule) => `- ${rule.label}: ${rule.description}`)
  );
}

export function buildToolInstructionsPromptSection(
  instructions: readonly string[] = []
): string {
  return buildLines(
    "Tool instructions",
    instructions.map((instruction) => `- ${instruction}`)
  );
}

export function buildBookingPromptSections(options: BookingPromptSectionOptions = {}): string {
  return [
    buildBookingIdentityPromptSection(options.copy),
    buildReservationRulesPromptSection(options.reservationRules),
    buildToolInstructionsPromptSection(options.toolInstructions),
    options.copy?.confirmationCopy ?? "",
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
}
