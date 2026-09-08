import type { Metadata } from 'next';
import { Electrolize, Inter } from 'next/font/google';
import './globals.css';

const electrolize = Electrolize({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-electrolize',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Project Play By CW',
    template: '%s | Project Play By CW',
  },
  description: "Bandar Sunway's gaming hub for racing simulators, PC gaming, PlayStation 5, and community events.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${electrolize.variable} font-sans antialiased min-h-screen flex flex-col bg-racing-dark text-white`}>
        {children}
      </body>
    </html>
  );
}
