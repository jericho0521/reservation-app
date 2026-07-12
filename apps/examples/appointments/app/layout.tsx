import type { ReactNode } from "react";
import "./globals.css";
import "@reservation-platform/ui/styles.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
