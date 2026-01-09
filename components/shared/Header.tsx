import Link from 'next/link';

export default function Header() {
    return (
        <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/10">
            <div className="container mx-auto px-6 h-20 flex items-center justify-between">
                <Link href="/" className="text-2xl font-bold font-heading tracking-tighter uppercase italic">
                    PROJECT PLAY<span className="text-neon drop-shadow-[0_0_10px_rgba(185,217,207,0.5)]"> by CW</span>
                </Link>

                <nav className="hidden md:flex items-center gap-8 text-sm tracking-wider uppercase">
                    <Link href="#features" className="hover:text-neon transition-colors">Features</Link>
                    <Link href="#pricing" className="hover:text-neon transition-colors">Pricing</Link>
                    <Link href="#technology" className="hover:text-neon transition-colors">Technology</Link>
                </nav>

                <button className="hidden md:block px-6 py-2 bg-neon/10 border border-neon text-neon text-sm uppercase tracking-wider hover:bg-neon hover:text-racing-dark transition-all duration-300 backdrop-blur-md">
                    Book Session
                </button>

                <button className="md:hidden text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
            </div>
        </header>
    );
}
