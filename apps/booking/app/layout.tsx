import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "@reservation-platform/ui/styles.css";

export const metadata: Metadata = {
  title: { default: "Book an experience", template: "%s · Reservations" },
  description: "Discover live availability and reserve your experience.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
