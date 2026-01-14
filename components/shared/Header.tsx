'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Header() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    return (
        <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/10">
            <div className="container mx-auto px-6 h-20 flex items-center justify-between">
                <Link href="/" className="text-2xl font-bold font-heading tracking-tighter uppercase italic">
                    PROJECT PLAY<span className="text-neon drop-shadow-[0_0_10px_rgba(185,217,207,0.5)]"> by CW</span>
                </Link>

                <nav className="hidden md:flex items-center gap-8 text-sm tracking-wider uppercase">
                    <Link href="/#services" className="hover:text-neon transition-colors">Services</Link>
                    <Link href="/#about" className="hover:text-neon transition-colors">About</Link>
                    <Link href="/chat-booking" className="hover:text-neon transition-colors">AI Chat</Link>
                </nav>

                <Link
                    href="/form-booking"
                    className="hidden md:block px-6 py-2 bg-neon/10 border border-neon text-neon text-sm uppercase tracking-wider hover:bg-neon hover:text-racing-dark transition-all duration-300 backdrop-blur-md"
                >
                    Book Session
                </Link>

                <button
                    className="md:hidden text-white p-2"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    aria-label="Toggle menu"
                >
                    {isMenuOpen ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    )}
                </button>
            </div>

            {/* Mobile Menu */}
            {isMenuOpen && (
                <div className="md:hidden bg-racing-dark/95 backdrop-blur-lg border-t border-white/10">
                    <nav className="container mx-auto px-6 py-6 flex flex-col gap-4">
                        <Link
                            href="/#services"
                            className="text-lg tracking-wider uppercase hover:text-neon transition-colors py-2"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            Services
                        </Link>
                        <Link
                            href="/#about"
                            className="text-lg tracking-wider uppercase hover:text-neon transition-colors py-2"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            About
                        </Link>
                        <Link
                            href="/chat-booking"
                            className="text-lg tracking-wider uppercase hover:text-neon transition-colors py-2"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            AI Chat
                        </Link>
                        <Link
                            href="/form-booking"
                            className="mt-4 px-6 py-3 bg-neon text-racing-dark text-center text-sm uppercase tracking-wider font-semibold"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            Book Session
                        </Link>
                    </nav>
                </div>
            )}
        </header>
    );
}
