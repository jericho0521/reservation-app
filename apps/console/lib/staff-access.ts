import type { InstallationLocationResponse, StaffMemberResponse } from "@reservation-platform/sdk";

export function staffNavigation(input: { role: "owner" | "staff" }) {
  return input.role === "owner" ? ["/admin/settings/staff"] : [];
}

export function venueAssignmentOptions(
  venues: readonly InstallationLocationResponse[],
  assignedVenueIds: readonly string[],
) {
  const assigned = new Set(assignedVenueIds);
  return venues.map((venue) => ({
    venueId: venue.location_id,
    label: venue.name,
    selected: assigned.has(venue.location_id),
  }));
}

export function staffStatusLabel(status: StaffMemberResponse["status"]) {
  return status === "invited" ? "Invitation pending" : status === "active" ? "Active" : "Disabled";
}
