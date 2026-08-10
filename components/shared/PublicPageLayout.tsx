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
      <main className="min-h-screen bg-racing-dark pt-28 text-white sm:pt-32">
        <header className="container mx-auto px-5 pb-12 text-center sm:px-6 sm:pb-16">
          {eyebrow && (
            <p className="mb-4 font-heading text-sm uppercase tracking-[0.25em] text-neon">
              {eyebrow}
            </p>
          )}
          <h1 className="break-words font-heading text-3xl font-black uppercase italic leading-tight tracking-tight sm:text-4xl md:text-6xl">
            {title}
          </h1>
          {description && (
            <p className="mx-auto mt-5 max-w-3xl text-base leading-relaxed text-gray-400 sm:mt-6 sm:text-lg">
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
