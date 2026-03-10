'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import './Navbar.css';

interface NavSubItem {
    name: string;
    href: string;
}

interface NavItemData {
    name: string;
    href?: string;
    items?: NavSubItem[];
}

const navItems: NavItemData[] = [
    { name: 'Services', href: '/#features' },
    { name: 'Pricing', href: '/#pricing' },
    {
        name: 'Book Now',
        items: [
            { name: 'Form Booking', href: '/form-booking' },
            { name: 'AI Chat Booking', href: '/chat-booking' },
        ],
    },
    { name: 'About', href: '/#about' },
];

interface NavItemProps {
    item: NavItemData;
    onHover: () => void;
    onLeave: () => void;
}

const NavItem = ({ item, onHover, onLeave }: NavItemProps) => {
    const content = (
        <>
            {item.name}
            {item.items && (
                <div className="nav-dropdown">
                    <div className="nav-dropdown-inner">
                        {item.items.map((subItem) => (
                            <Link
                                key={subItem.name}
                                href={subItem.href}
                                className="nav-dropdown-item"
                            >
                                {subItem.name}
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </>
    );

    if (item.href) {
        return (
            <Link
                href={item.href}
                className="nav-item"
                onMouseEnter={onHover}
                onMouseLeave={onLeave}
            >
                {content}
            </Link>
        );
    }

    return (
        <span
            className="nav-item"
            onMouseEnter={onHover}
            onMouseLeave={onLeave}
        >
            {content}
        </span>
    );
};

export default function Navbar() {
    const [activeItem, setActiveItem] = useState<number | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [underlineStyle, setUnderlineStyle] = useState({ width: 0, left: 0 });
    const navRef = useRef<HTMLElement>(null);
    const itemRefs = useRef<(HTMLElement | null)[]>([]);

    useEffect(() => {
        if (activeItem !== null && itemRefs.current[activeItem] && navRef.current) {
            const item = itemRefs.current[activeItem];
            const nav = navRef.current;
            if (item) {
                const navRect = nav.getBoundingClientRect();
                const itemRect = item.getBoundingClientRect();
                setUnderlineStyle({
                    width: itemRect.width - 32,
                    left: itemRect.left - navRect.left + 16,
                });
            }
        }
    }, [activeItem]);

    const handleHover = (index: number) => {
        setActiveItem(index);
    };

    const handleLeave = () => {
        setActiveItem(null);
    };

    return (
        <header className="landing-navbar">
            <div className="nav-end">
                <Link href="/" className="nav-logo">
                    PROJECT PLAY<span className="nav-logo-accent"> by CW</span>
                </Link>
            </div>

            <nav ref={navRef}>
                {navItems.map((item, index) => (
                    <span
                        key={item.name}
                        ref={(el) => { itemRefs.current[index] = el; }}
                    >
                        <NavItem
                            item={item}
                            onHover={() => handleHover(index)}
                            onLeave={handleLeave}
                        />
                    </span>
                ))}
                <div
                    className={`nav-underline ${activeItem !== null ? 'active' : ''}`}
                    style={{
                        width: underlineStyle.width,
                        left: underlineStyle.left,
                    }}
                />
            </nav>

            <div className="nav-end">
                <Link href="/form-booking" className="nav-cta">
                    Book Session
                </Link>

                <button
                    className="nav-mobile-toggle"
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
            <div className={`nav-mobile-menu ${isMenuOpen ? 'open' : ''}`}>
                {navItems.map((item) => (
                    item.items ? (
                        item.items.map((subItem) => (
                            <Link
                                key={subItem.name}
                                href={subItem.href}
                                className="nav-mobile-item"
                                onClick={() => setIsMenuOpen(false)}
                            >
                                {subItem.name}
                            </Link>
                        ))
                    ) : (
                        <Link
                            key={item.name}
                            href={item.href || '#'}
                            className="nav-mobile-item"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            {item.name}
                        </Link>
                    )
                ))}
                <Link
                    href="/form-booking"
                    className="nav-mobile-cta"
                    onClick={() => setIsMenuOpen(false)}
                >
                    Book Session
                </Link>
            </div>
        </header>
    );
}
