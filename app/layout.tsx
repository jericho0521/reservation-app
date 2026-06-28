import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tickets — Cinema Seat Booking",
  description:
    "Book movie showtimes and choose your seats. A frontend-only demo for the modular reservation platform.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}