"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  activeVenueCookieName,
  validateActiveVenueSelection,
} from "../../lib/auth-session";
import { createConsolePlatformClient } from "../../lib/platform-client";

export async function selectActiveVenue(formData: FormData) {
  const requestedVenueId = formData.get("venue_id");
  if (typeof requestedVenueId !== "string") throw new Error("A location is required.");

  const session = await createConsolePlatformClient(
    process.env,
    fetch,
    { includeActiveVenue: false },
  ).getSession();
  const venueId = validateActiveVenueSelection(session.venue_ids, requestedVenueId);
  if (!venueId) throw new Error("That location is not assigned to this session.");

  (await cookies()).set(activeVenueCookieName, venueId, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
  });
  redirect("/admin");
}
