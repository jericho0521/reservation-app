import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movie Ticketing Frontend Demo",
  description: "Frontend-only mocked movie ticketing booking demo for the modular reservation platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}