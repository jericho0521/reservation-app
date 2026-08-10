import type { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';
import FloatingChat from '@/components/chat/FloatingChat';

interface PublicPageLayoutProps {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
}

export default function PublicPageLayout({
  eyebrow,
  title,
  description,
  children,
}: PublicPageLayoutProps) {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-racing-dark pt-32 text-white">
        <header className="container mx-auto px-6 pb-16 text-center">
          {eyebrow && (
            <p className="mb-4 font-heading text-sm uppercase tracking-[0.25em] text-neon">
              {eyebrow}
            </p>
          )}
          <h1 className="font-heading text-4xl font-black uppercase italic tracking-tight md:text-6xl">
            {title}
          </h1>
          {description && (
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-gray-400">
              {description}
            </p>
          )}
        </header>
        {children}
      </main>
      <Footer />
      <FloatingChat />
    </>
  );
}
