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
  title: 'Apex Racing Simulators',
  description: 'Experience the ultimate racing simulation.',
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
