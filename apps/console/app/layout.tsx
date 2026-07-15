import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ConsoleShell } from "../components/console-shell";
import {
  activeVenueCookieName,
  locationRouteHeader,
  onboardingRouteHeader,
  publicRouteHeader,
  resolveActiveLocation,
} from "../lib/auth-session";
import { createConsolePlatformClient } from "../lib/platform-client";
import "./globals.css";
import "@reservation-platform/ui/styles.css";

export const metadata: Metadata = {
  title: "Reservation Experience Platform",
  description: "Configure and operate every reservation channel from one workspace.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const requestHeaders = await headers();
  const isPublicRoute = requestHeaders.get(publicRouteHeader) === "1";
  const isLocationRoute = requestHeaders.get(locationRouteHeader) === "1";
  const isOnboardingRoute = requestHeaders.get(onboardingRouteHeader) === "1";
  let session: { role: "owner" | "staff"; venue_ids: string[] } | undefined;
  let activeLocation: { venueId: string; canChange: boolean } | undefined;
  if (!isPublicRoute) {
    try {
      session = await createConsolePlatformClient(process.env, fetch, { includeActiveVenue: false }).getSession();
    } catch {
      redirect("/admin/login");
    }
    if (!isLocationRoute && !isOnboardingRoute) {
      const location = resolveActiveLocation(
        session.venue_ids,
        (await cookies()).get(activeVenueCookieName)?.value,
      );
      if (location.kind === "onboarding") redirect("/admin/onboarding");
      if (location.kind === "selection_required") redirect("/admin/location");
      activeLocation = location;
    }
  }

  return (
    <html lang="en">
      <body>
        {isPublicRoute || isLocationRoute || isOnboardingRoute
          ? children
          : <ConsoleShell activeLocation={activeLocation} role={session?.role}>{children}</ConsoleShell>}
      </body>
    </html>
  );
}
