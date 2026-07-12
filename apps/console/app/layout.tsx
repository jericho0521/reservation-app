import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConsoleShell } from "../components/console-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reservation Experience Platform",
  description: "Configure and operate every reservation channel from one workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ConsoleShell>{children}</ConsoleShell>
      </body>
    </html>
  );
}
