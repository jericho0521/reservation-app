import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ConsoleShell } from "../components/console-shell";
import { createConsolePlatformClient } from "../lib/platform-client";
import "./globals.css";
import "@reservation-platform/ui/styles.css";

export const metadata: Metadata = {
  title: "Reservation Experience Platform",
  description: "Configure and operate every reservation channel from one workspace.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const isPublicRoute = (await headers()).get("x-reservation-console-public-route") === "1";
  let session: { role: "owner" | "staff" } | undefined;
  if (!isPublicRoute) {
    try {
      session = await createConsolePlatformClient().getSession();
    } catch {
      redirect("/admin/login");
    }
  }

  return (
    <html lang="en">
      <body>
        {isPublicRoute ? children : <ConsoleShell role={session?.role}>{children}</ConsoleShell>}
      </body>
    </html>
  );
}
